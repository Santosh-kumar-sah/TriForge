import time
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import os
from typing import List, Optional

from app.database.session import get_db
from app.database.models import RequestModel, ResponseModel, BenchmarkModel
from app.database.schemas import (
    ChatRequest, ChatResponse, RouterExplanationRequest, RouterExplanationResponse,
    AnalyticsSummary, BenchmarkRunRequest, BenchmarkSummary, SettingsPayload
)
from app.config import settings
from app.router.routing_engine import RoutingEngine
from app.providers.groq_provider import GroqProvider
from app.providers.remote_fireworks import RemoteFireworksProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.evaluation.consistency import ConsistencyChecker
from app.evaluation.hallucination import HallucinationDetector
from app.utils.compressor import PromptCompressor
from app.cache.smart_cache import SmartCache
from app.analytics.engine import AnalyticsEngine
from app.benchmark.runner import BenchmarkRunner

router = APIRouter(prefix="/api")

# Instantiate Core Engines
groq_local = GroqProvider()         # "Local" model — free Groq Llama 3.1 8B
fireworks = RemoteFireworksProvider()
openai_prov = OpenAIProvider()
anthropicprov = AnthropicProvider()

routing_engine = RoutingEngine()
consistency_checker = ConsistencyChecker(groq_local)
hallucination_detector = HallucinationDetector()
prompt_compressor = PromptCompressor(groq_local)
smart_cache = SmartCache()
analytics_engine = AnalyticsEngine()

# Helpers
def resolve_remote_model(model: str) -> str:
    """
    Ensures that if the selected model requires an API key that is not configured
    (or is a dummy placeholder), we fallback to the default Groq model.
    """
    model_lower = model.lower()
    
    # 1. Fireworks AI Check
    if "fireworks" in model_lower or "accounts/fireworks" in model_lower:
        is_missing = (
            not settings.FIREWORKS_API_KEY 
            or settings.FIREWORKS_API_KEY.startswith("key_") 
            or "placeholder" in settings.FIREWORKS_API_KEY.lower()
            or "your_" in settings.FIREWORKS_API_KEY.lower()
            or settings.FIREWORKS_API_KEY.strip() == ""
        )
        if is_missing:
            return "groq/compound"
            
    # 2. OpenAI Check
    elif "gpt" in model_lower or "text-davinci" in model_lower:
        is_missing = (
            not settings.OPENAI_API_KEY 
            or "placeholder" in settings.OPENAI_API_KEY.lower()
            or "your_" in settings.OPENAI_API_KEY.lower()
            or settings.OPENAI_API_KEY.strip() == ""
        )
        if is_missing:
            return "groq/compound"
            
    # 3. Anthropic Check
    elif "claude" in model_lower:
        is_missing = (
            not settings.ANTHROPIC_API_KEY 
            or "placeholder" in settings.ANTHROPIC_API_KEY.lower()
            or "your_" in settings.ANTHROPIC_API_KEY.lower()
            or settings.ANTHROPIC_API_KEY.strip() == ""
        )
        if is_missing:
            return "groq/compound"
            
    return model

def get_remote_provider(model: str):
    """
    Selects provider based on remote model prefix/config.
    Falls back to Groq if no provider-specific key is set.
    """
    if "gpt" in model.lower() or "text-davinci" in model.lower():
        return openai_prov
    elif "claude" in model.lower():
        return anthropicprov
    elif "fireworks" in model.lower() or "accounts/fireworks" in model.lower():
        return fireworks
    # Default: use Groq as remote provider (works with just GROQ_API_KEY)
    return groq_local

@router.post("/router", response_model=RouterExplanationResponse)
def explain_route(req: RouterExplanationRequest):
    """
    Simulates routing and returns estimates (explainability endpoint).
    """
    category = routing_engine.classifier.classify(req.prompt)
    estimates = routing_engine.estimate_metrics(req.prompt, category)
    
    # Decide route
    route_name, reason, _ = routing_engine.route(req.prompt)

    return RouterExplanationResponse(
        prompt=req.prompt,
        route=route_name,
        reason=reason,
        word_count=estimates["word_count"],
        detected_category=estimates["category"],
        estimated_local_latency_ms=estimates["est_local_latency_ms"],
        estimated_remote_latency_ms=estimates["est_remote_latency_ms"],
        estimated_remote_cost=estimates["est_remote_cost"]
    )

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    start_time = time.time()
    
    # 1. Cache Check
    if settings.ENABLE_CACHE:
        cached_entry, hit_type, sim_score = smart_cache.get(db, req.prompt)
        if cached_entry:
            route_label = f"CACHE HIT ({hit_type})"
            route_desc = f"Resolved from cache database via {hit_type.lower()} matching (similarity: {sim_score:.2f})."
            
            # Create a mock Request & Response log
            new_request = RequestModel(
                prompt=req.prompt,
                routed_to="cache",
                final_route=route_label,
                route_reason=route_desc,
                latency_ms=0.0,
                prompt_tokens=cached_entry.prompt_tokens,
                completion_tokens=cached_entry.completion_tokens,
                cost=0.0
            )
            db.add(new_request)
            db.flush()
            
            new_response = ResponseModel(
                request_id=new_request.id,
                response_text=cached_entry.response_text,
                confidence_score=round(sim_score, 2),
                is_cached=True
            )
            db.add(new_response)
            db.commit()
            
            return ChatResponse(
                id=new_request.id,
                prompt=req.prompt,
                response_text=cached_entry.response_text,
                route=route_label,
                reason=route_desc,
                latency_ms=0.0,
                prompt_tokens=cached_entry.prompt_tokens,
                completion_tokens=cached_entry.completion_tokens,
                estimated_cost=0.0,
                confidence_score=round(sim_score, 2),
                is_cached=True,
                timestamp=new_request.timestamp
            )

    # 2. Run Route Engine
    route_name, reason, estimates = routing_engine.route(req.prompt)
    
    local_model = req.local_model or settings.ACTIVE_LOCAL_MODEL
    remote_model = req.remote_model or settings.ACTIVE_REMOTE_MODEL
    remote_model = resolve_remote_model(remote_model)
    threshold = req.threshold or settings.DEFAULT_CONSISTENCY_THRESHOLD

    final_route = route_name.upper()
    route_reason = reason
    ans = ""
    p_tok, c_tok = 0, 0
    confidence = 1.0
    escalated = False
    draft = None

    category = estimates.get("category", "general_qa")

    if route_name == "local":
        # Bypass self-consistency check for low-risk or subjective tasks (saves token cost & avoids false-positives)
        bypass_consistency = category in ["conversation", "translation", "creative_writing", "summarization", "extraction"]
        
        if bypass_consistency:
            s1, total_p, total_c = groq_local.generate(req.prompt, local_model)
            sim = 1.0
            p_tok += total_p
            c_tok += total_c
            confidence = 1.0
            draft = s1
        else:
            # Run self-consistency for high-stakes/factual reasoning tasks
            sim, s1, s2, total_p, total_c = consistency_checker.check_consistency(req.prompt, local_model, threshold)
            p_tok += total_p
            c_tok += total_c
            confidence = sim
            draft = s1

        # Run hallucination check
        flagged_info = hallucination_detector.check_hallucination_signals(s1)

        if sim < threshold or flagged_info["flagged"]:
            escalated = True
            final_route = "LOCAL -> ESCALATED TO REMOTE"
            route_reason = (
                f"Escalated because consistency similarity ({sim:.2f}) was below threshold ({threshold:.2f}) "
                f"or hedging/hallucination flags were raised: {flagged_info['reasons']}"
            )
            
            # Verify Draft Escalation
            prov = get_remote_provider(remote_model)
            if hasattr(prov, "verify_draft") and not s1.startswith("Error querying Groq model"):
                ans, r_p, r_c = prov.verify_draft(req.prompt, s1, remote_model)
            else:
                # If provider doesn't support verify-draft or draft is an error, run normal remote fallback
                ans, r_p, r_c = prov.generate(req.prompt, remote_model)
            p_tok += r_p
            c_tok += r_c
        else:
            # Trusted local response
            ans = s1
    else:
        # Route Remote directly
        prompt_to_send = req.prompt
        if settings.ENABLE_PROMPT_COMPRESSION:
            prompt_to_send = prompt_compressor.compress(req.prompt)
            route_reason += " (Prompt Compressed before sending)"

        prov = get_remote_provider(remote_model)
        ans, r_p, r_c = prov.generate(prompt_to_send, remote_model)
        p_tok += r_p
        c_tok += r_c

    latency = (time.time() - start_time) * 1000
    
    # Calculate Cost
    cost = 0.0
    if "remote" in final_route.lower() or escalated:
        # Fireworks Llama 8b estimation
        cost = (p_tok + c_tok) * (0.20 / 1_000_000)

    # Save to Database
    new_request = RequestModel(
        prompt=req.prompt,
        routed_to=route_name,
        final_route=final_route,
        route_reason=route_reason,
        latency_ms=latency,
        prompt_tokens=p_tok,
        completion_tokens=c_tok,
        cost=cost
    )
    db.add(new_request)
    db.flush()

    new_response = ResponseModel(
        request_id=new_request.id,
        response_text=ans,
        confidence_score=confidence,
        is_cached=False,
        draft_text=draft
    )
    db.add(new_response)
    db.commit()

    # Save in Cache
    if settings.ENABLE_CACHE and not escalated:
        # Don't cache escalated drafts directly unless desired, cache clean responses
        smart_cache.set(db, req.prompt, ans, remote_model if "remote" in final_route.lower() else local_model, p_tok, c_tok, latency)

    return ChatResponse(
        id=new_request.id,
        prompt=req.prompt,
        response_text=ans,
        route=final_route,
        reason=route_reason,
        latency_ms=latency,
        prompt_tokens=p_tok,
        completion_tokens=c_tok,
        estimated_cost=cost,
        confidence_score=confidence,
        is_cached=False,
        draft_text=draft,
        timestamp=new_request.timestamp
    )

@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    """
    Streams output using Server-Sent Events (SSE).
    """
    route_name, reason, estimates = routing_engine.route(req.prompt)
    local_model = req.local_model or settings.ACTIVE_LOCAL_MODEL
    remote_model = req.remote_model or settings.ACTIVE_REMOTE_MODEL
    remote_model = resolve_remote_model(remote_model)
    threshold = req.threshold or settings.DEFAULT_CONSISTENCY_THRESHOLD

    async def stream_generator():
        start_time = time.time()
        p_tok, c_tok = 0, 0
        final_route = route_name.upper()
        route_reason = reason
        escalated = False
        draft_text = None
        ans_accumulator = []
        confidence = 1.0

        # Send Routing Decision Event
        yield f"data: {json.dumps({'event': 'routing', 'route': route_name, 'reason': reason})}\n\n"
        await asyncio.sleep(0.01)

        category = estimates.get("category", "general_qa")

        if route_name == "local":
            # Bypass self-consistency check for low-risk or subjective tasks (saves token cost & avoids false-positives)
            bypass_consistency = category in ["conversation", "translation", "creative_writing", "summarization", "extraction"]
            
            if bypass_consistency:
                s1, total_p, total_c = groq_local.generate(req.prompt, local_model)
                sim = 1.0
                p_tok += total_p
                c_tok += total_c
                draft_text = s1
                confidence = 1.0
            else:
                # Run self-consistency check for high-stakes/factual reasoning tasks
                sim, s1, s2, total_p, total_c = consistency_checker.check_consistency(req.prompt, local_model, threshold)
                p_tok += total_p
                c_tok += total_c
                draft_text = s1
                confidence = sim

            flagged_info = hallucination_detector.check_hallucination_signals(s1)

            if sim < threshold or flagged_info["flagged"]:
                escalated = True
                final_route = "LOCAL -> ESCALATED TO REMOTE"
                route_reason = (
                    f"Escalated: Similarity ({sim:.2f}) < threshold ({threshold:.2f}) "
                    f"or flagged: {flagged_info['reasons']}"
                )
                yield f"data: {json.dumps({'event': 'escalation', 'reason': route_reason, 'draft': s1})}\n\n"
                await asyncio.sleep(0.01)

                prov = get_remote_provider(remote_model)
                if hasattr(prov, "verify_draft_stream") and not s1.startswith("Error querying Groq model"):
                    # Stream remote verify
                    stream = prov.verify_draft_stream(req.prompt, s1, remote_model)
                    chunk = {}
                    for chunk in stream:
                        delta = chunk.get("text", "")
                        ans_accumulator.append(delta)
                        yield f"data: {json.dumps({'event': 'content', 'text': delta})}\n\n"
                        await asyncio.sleep(0.005)
                    # final tokens
                    p_tok += chunk.get("prompt_tokens", 0)
                    c_tok += chunk.get("completion_tokens", 0)
                else:
                    # fallback normal stream
                    stream = prov.generate_stream(req.prompt, remote_model)
                    chunk = {}
                    for chunk in stream:
                        delta = chunk.get("text", "")
                        ans_accumulator.append(delta)
                        yield f"data: {json.dumps({'event': 'content', 'text': delta})}\n\n"
                        await asyncio.sleep(0.005)
                    p_tok += chunk.get("prompt_tokens", 0)
                    c_tok += chunk.get("completion_tokens", 0)
            else:
                # Simulating local stream of trusted response to UI
                yield f"data: {json.dumps({'event': 'status', 'text': 'Streaming trusted local response...'})}\n\n"
                await asyncio.sleep(0.01)
                for word in s1.split(" "):
                    ans_accumulator.append(word + " ")
                    yield f"data: {json.dumps({'event': 'content', 'text': word + ' '})}\n\n"
                    await asyncio.sleep(0.02)  # Simulate typing
        else:
            # Direct remote stream
            prompt_to_send = req.prompt
            if settings.ENABLE_PROMPT_COMPRESSION:
                prompt_to_send = prompt_compressor.compress(req.prompt)
                route_reason += " (Prompt Compressed)"

            prov = get_remote_provider(remote_model)
            stream = prov.generate_stream(prompt_to_send, remote_model)
            
            # Iterate stream
            chunk = {}
            for chunk in stream:
                delta = chunk.get("text", "")
                ans_accumulator.append(delta)
                yield f"data: {json.dumps({'event': 'content', 'text': delta})}\n\n"
                await asyncio.sleep(0.005)
            
            p_tok += chunk.get("prompt_tokens", 0)
            c_tok += chunk.get("completion_tokens", 0)

        latency = (time.time() - start_time) * 1000
        cost = 0.0
        if "remote" in final_route.lower() or escalated:
            cost = (p_tok + c_tok) * (0.20 / 1_000_000)

        full_ans = "".join(ans_accumulator)

        # Database writing wrapped in async run
        db_req = RequestModel(
            prompt=req.prompt,
            routed_to=route_name,
            final_route=final_route,
            route_reason=route_reason,
            latency_ms=latency,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            cost=cost
        )
        db.add(db_req)
        db.flush()

        db_resp = ResponseModel(
            request_id=db_req.id,
            response_text=full_ans,
            confidence_score=confidence,
            is_cached=False,
            draft_text=draft_text
        )
        db.add(db_resp)
        db.commit()

        # Cache saving
        if settings.ENABLE_CACHE and not escalated:
            smart_cache.set(db, req.prompt, full_ans, remote_model if "remote" in final_route.lower() else local_model, p_tok, c_tok, latency)

        # Send final details event
        yield f"data: {json.dumps({'event': 'done', 'id': db_req.id, 'latency_ms': latency, 'prompt_tokens': p_tok, 'completion_tokens': c_tok, 'estimated_cost': cost, 'route': final_route, 'confidence_score': confidence})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@router.get("/analytics", response_model=AnalyticsSummary)
def get_analytics(db: Session = Depends(get_db)):
    return analytics_engine.get_summary(db)

@router.get("/history", response_model=List[ChatResponse])
def get_history(limit: int = 20, db: Session = Depends(get_db)):
    requests = db.query(RequestModel).order_by(RequestModel.timestamp.desc()).limit(limit).all()
    history = []
    for req in requests:
        resp = db.query(ResponseModel).filter(ResponseModel.request_id == req.id).first()
        history.append(ChatResponse(
            id=req.id,
            prompt=req.prompt,
            response_text=resp.response_text if resp else "",
            route=req.final_route,
            reason=req.route_reason,
            latency_ms=req.latency_ms,
            prompt_tokens=req.prompt_tokens,
            completion_tokens=req.completion_tokens,
            estimated_cost=req.cost,
            confidence_score=resp.confidence_score if resp else 1.0,
            is_cached=resp.is_cached if resp else False,
            draft_text=resp.draft_text if resp else None,
            timestamp=req.timestamp
        ))
    return history

@router.post("/benchmark")
def run_benchmark_endpoint(req: BenchmarkRunRequest, db: Session = Depends(get_db)):
    runner = BenchmarkRunner(db)
    return runner.run_benchmark(req.benchmark_name, req.threshold)

@router.get("/benchmarks", response_model=List[BenchmarkSummary])
def get_benchmarks(limit: int = 10, db: Session = Depends(get_db)):
    b_records = db.query(BenchmarkModel).order_by(BenchmarkModel.timestamp.desc()).limit(limit).all()
    return [
        BenchmarkSummary(
            id=b.id,
            benchmark_name=b.benchmark_name,
            timestamp=b.timestamp,
            total_tasks=b.total_tasks,
            accuracy=b.accuracy,
            remote_tokens=b.remote_tokens,
            local_tokens=b.local_tokens,
            cost=b.cost,
            savings=b.savings,
            latency_avg=b.latency_avg,
            config_json=b.config_json
        ) for b in b_records
    ]

@router.get("/models")
def get_supported_models():
    """
    Returns options list for settings and configurations.
    """
    return {
        "local": [
            {"id": "groq/compound-mini", "name": "Groq Compound Mini (Recommended)"},
            {"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B (Groq)"},
            {"id": "qwen/qwen3.6-27b", "name": "Qwen 3.6 27B (Groq)"}
        ],
        "remote": [
            {"id": "groq/compound", "name": "Groq Compound (Recommended)"},
            {"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B (Groq)"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini (OpenAI)"},
            {"id": "gpt-4o", "name": "GPT-4o (OpenAI)"},
            {"id": "claude-3-5-sonnet-20240620", "name": "Claude 3.5 Sonnet (Anthropic)"}
        ]
    }

def mask_api_key(key: Optional[str]) -> Optional[str]:
    if not key or key.strip() == "" or "placeholder" in key.lower() or "your_" in key.lower():
        return ""
    # Fully mask the key for maximum security — never leak key prefixes, suffixes, or raw keys to the web UI
    return "••••••••"

def is_masked(key: Optional[str]) -> bool:
    if not key:
        return False
    key_str = key.strip()
    return "..." in key_str or "*" in key_str or "•" in key_str or "placeholder" in key_str.lower() or "your_" in key_str.lower()

def update_env_file(updates: dict[str, str]):
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
    if not os.path.exists(env_path):
        return
        
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        updated_keys = set()
        new_lines = []
        
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                key, val = stripped.split("=", 1)
                key = key.strip()
                if key in updates:
                    new_lines.append(f"{key}={updates[key]}\n")
                    updated_keys.add(key)
                    continue
            new_lines.append(line)
            
        # Append any keys that weren't already in the file
        for key, val in updates.items():
            if key not in updated_keys:
                new_lines.append(f"{key}={val}\n")
                
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        pass

from app.utils.hardware_detect import get_hardware_info

@router.get("/settings", response_model=SettingsPayload)
def get_settings():
    return SettingsPayload(
        active_local_model=settings.ACTIVE_LOCAL_MODEL,
        active_remote_model=settings.ACTIVE_REMOTE_MODEL,
        default_threshold=settings.DEFAULT_CONSISTENCY_THRESHOLD,
        enable_cache=settings.ENABLE_CACHE,
        enable_prompt_compression=settings.ENABLE_PROMPT_COMPRESSION,
        compute_backend=get_hardware_info()["compute_backend"],
        fireworks_api_key=mask_api_key(settings.FIREWORKS_API_KEY),
        openai_api_key=mask_api_key(settings.OPENAI_API_KEY),
        anthropic_api_key=mask_api_key(settings.ANTHROPIC_API_KEY),
        gemini_api_key=mask_api_key(settings.GEMINI_API_KEY),
        groq_api_key=mask_api_key(settings.GROQ_API_KEY),
        together_api_key=mask_api_key(settings.TOGETHER_API_KEY)
    )

@router.post("/settings")
def update_settings(payload: SettingsPayload):
    # Dynamically update settings in memory
    settings.ACTIVE_LOCAL_MODEL = payload.active_local_model
    settings.ACTIVE_REMOTE_MODEL = payload.active_remote_model
    settings.DEFAULT_CONSISTENCY_THRESHOLD = payload.default_threshold
    settings.ENABLE_CACHE = payload.enable_cache
    settings.ENABLE_PROMPT_COMPRESSION = payload.enable_prompt_compression
    
    env_updates = {
        "ACTIVE_LOCAL_MODEL": payload.active_local_model,
        "ACTIVE_REMOTE_MODEL": payload.active_remote_model,
        "DEFAULT_CONSISTENCY_THRESHOLD": str(payload.default_threshold),
        "ENABLE_CACHE": "true" if payload.enable_cache else "false",
        "ENABLE_PROMPT_COMPRESSION": "true" if payload.enable_prompt_compression else "false",
    }

    # Only update API keys if they are provided, not empty/null, and NOT masked
    if payload.fireworks_api_key is not None:
        if not is_masked(payload.fireworks_api_key):
            settings.FIREWORKS_API_KEY = payload.fireworks_api_key
            env_updates["FIREWORKS_API_KEY"] = payload.fireworks_api_key
            
    if payload.openai_api_key is not None:
        if not is_masked(payload.openai_api_key):
            settings.OPENAI_API_KEY = payload.openai_api_key
            env_updates["OPENAI_API_KEY"] = payload.openai_api_key
            
    if payload.anthropic_api_key is not None:
        if not is_masked(payload.anthropic_api_key):
            settings.ANTHROPIC_API_KEY = payload.anthropic_api_key
            env_updates["ANTHROPIC_API_KEY"] = payload.anthropic_api_key
            
    if payload.gemini_api_key is not None:
        if not is_masked(payload.gemini_api_key):
            settings.GEMINI_API_KEY = payload.gemini_api_key
            env_updates["GEMINI_API_KEY"] = payload.gemini_api_key
            
    if payload.groq_api_key is not None:
        if not is_masked(payload.groq_api_key):
            settings.GROQ_API_KEY = payload.groq_api_key
            env_updates["GROQ_API_KEY"] = payload.groq_api_key
            
    if payload.together_api_key is not None:
        if not is_masked(payload.together_api_key):
            settings.TOGETHER_API_KEY = payload.together_api_key
            env_updates["TOGETHER_API_KEY"] = payload.together_api_key

    # Save to .env file
    update_env_file(env_updates)

    return {"status": "success", "message": "Settings updated in memory and .env file."}
