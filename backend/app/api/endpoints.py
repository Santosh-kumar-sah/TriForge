import time
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import os
from typing import List, Optional
from datetime import timezone

from app.database.session import get_db
from app.database.models import (
    RequestModel, ResponseModel, BenchmarkModel, CacheEventModel, 
    RouterThresholdModel, RouterAdjustmentLogModel, ProviderFailoverLogModel,
    SecurityEventModel, UserSettingsModel
)
from app.database.schemas import (
    ChatRequest, ChatResponse, RouterExplanationRequest, RouterExplanationResponse,
    AnalyticsSummary, BenchmarkRunRequest, BenchmarkSummary, SettingsPayload
)
from app.config import settings
from app.router.routing_engine import RoutingEngine
from app.router.adaptive_tuner import AdaptiveThresholdManager
from app.providers.groq_provider import GroqProvider
from app.providers.remote_fireworks import RemoteFireworksProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.failover_manager import ProviderHealthManager
from app.security.prompt_guard import PromptGuard
from app.security.limiter import RateLimiter
from app.evaluation.consistency import ConsistencyChecker
from app.evaluation.hallucination import HallucinationDetector
from app.utils.compressor import PromptCompressor
from app.cache.smart_cache import SmartCache
from app.analytics.engine import AnalyticsEngine
from app.benchmark.runner import BenchmarkRunner
from app.utils.hardware_detect import get_hardware_info

adaptive_tuner = AdaptiveThresholdManager()
failover_manager = ProviderHealthManager()
prompt_guard = PromptGuard(enabled=True)
rate_limiter = RateLimiter(requests_per_minute=30, window_sec=60)

router = APIRouter(prefix="/api")

# User Identity Extraction Helper
def get_current_user_email(request: Request) -> Optional[str]:
    if not request:
        return None
    email = request.headers.get("X-User-Email") or request.headers.get("x-user-email")
    if email and email.strip():
        return email.strip().lower()
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth and "Bearer" in auth:
        token = auth.split("Bearer")[-1].strip()
        if "@" in token:
            return token.strip().lower()
    return None

def get_current_user_id(request: Request) -> Optional[str]:
    if not request:
        return None
    uid = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
    if uid and uid.strip():
        return uid.strip()
    return None

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
def chat_endpoint(req: ChatRequest, request: Request, db: Session = Depends(get_db)):
    start_time = time.time()
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    user_email = req.user_email or get_current_user_email(request)
    user_id = req.user_id or get_current_user_id(request)

    # Rate Limiter check (30 req / min)
    allowed, count = rate_limiter.is_allowed(client_ip)
    if not allowed:
        rate_limiter.log_security_event(db, "rate_limit_exceeded", client_ip, req.prompt, ["rate_limit_exceeded_30_per_min"])
        raise HTTPException(status_code=429, detail="Rate limit exceeded: Maximum 30 requests per minute per IP.")

    # Prompt Guard check (Prompt Injection / Jailbreak)
    is_injected, reasons = prompt_guard.inspect(req.prompt)
    if is_injected:
        rate_limiter.log_security_event(db, "prompt_injection", client_ip, req.prompt, reasons)
        raise HTTPException(
            status_code=400, 
            detail=f"Security Alert: Prompt injection pattern detected ({', '.join(reasons)}). Request refused."
        )
    
    # 1. Cache Check
    if settings.ENABLE_CACHE:
        cached_entry, hit_type, sim_score = smart_cache.get(db, req.prompt)
        if cached_entry:
            route_label = f"CACHE HIT ({hit_type})"
            route_desc = f"Resolved from cache database via {hit_type.lower()} matching (similarity: {sim_score:.2f})."
            
            # Create a mock Request & Response log
            new_request = RequestModel(
                user_id=user_id,
                user_email=user_email.strip().lower() if user_email else None,
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
                intent=routing_engine.classifier.classify(req.prompt),
                compute_backend=get_hardware_info()["compute_backend"],
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
    active_threshold = req.threshold if req.threshold is not None else adaptive_tuner.get_threshold(db, category)
    word_count = len(req.prompt.split())

    if route_name == "local":
        # Bypass self-consistency check for low-risk, conversational, general QA, or short tasks (<= 15 words)
        bypass_consistency = (
            category in ["conversation", "general_qa", "translation", "creative_writing", "summarization", "extraction"] 
            or word_count <= 15
        )
        
        if bypass_consistency:
            s1, total_p, total_c = groq_local.generate(req.prompt, local_model)
            sim = 1.0
            p_tok += total_p
            c_tok += total_c
            confidence = 1.0
            draft = s1
        else:
            # Run self-consistency for complex high-stakes reasoning/math tasks
            sim, s1, s2, total_p, total_c = consistency_checker.check_consistency(req.prompt, local_model, active_threshold)
            p_tok += total_p
            c_tok += total_c
            confidence = sim
            draft = s1

        # Check if local model generation failed with an error message (e.g. rate limit 429)
        if s1 and s1.startswith("Error"):
            final_route = "REMOTE (FALLBACK - LOCAL UNAVAILABLE)"
            route_reason = f"Local provider rate limited or unavailable ({s1[:60]}...). Executed remote fallback directly."
            ans, r_p, r_c, used_p = failover_manager.generate_with_failover(req.prompt, "groq", remote_model, db)
            p_tok += r_p
            c_tok += r_c
            confidence = 1.0
        else:
            # Run hallucination check
            flagged_info = hallucination_detector.check_hallucination_signals(s1)

            if sim < active_threshold or flagged_info["flagged"]:
                escalated = True
                final_route = "LOCAL -> ESCALATED TO REMOTE"
                route_reason = (
                    f"Escalated because consistency similarity ({sim:.2f}) was below threshold ({active_threshold:.2f}) "
                    f"or hedging/hallucination flags were raised: {flagged_info['reasons']}"
                )
                
                # Verify-Draft logic using local draft as context
                ans, r_p, r_c, used_p = failover_manager.verify_draft_with_failover(req.prompt, s1, "groq", remote_model, db)
                p_tok += r_p
                c_tok += r_c
            else:
                # Trusted local response
                ans = s1

            # Trigger adaptive threshold tuning feedback loop
            adaptive_tuner.record_outcome_and_tune(db, category, escalated, sim)
    else:
        # Route Remote directly
        prompt_to_send = req.prompt
        if settings.ENABLE_PROMPT_COMPRESSION:
            prompt_to_send = prompt_compressor.compress(req.prompt)
            route_reason += " (Prompt Compressed before sending)"

        ans, r_p, r_c, used_p = failover_manager.generate_with_failover(prompt_to_send, "groq", remote_model, db)
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
        user_id=user_id,
        user_email=user_email.strip().lower() if user_email else None,
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
    if settings.ENABLE_CACHE and ans and not ans.startswith("Error"):
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
        intent=category,
        compute_backend=get_hardware_info()["compute_backend"],
        timestamp=new_request.timestamp.replace(tzinfo=timezone.utc)
    )

@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, request: Request, db: Session = Depends(get_db)):
    """
    Streams output using Server-Sent Events (SSE).
    """
    user_email = req.user_email or get_current_user_email(request)
    user_id = req.user_id or get_current_user_id(request)
    route_name, reason, estimates = routing_engine.route(req.prompt)
    local_model = req.local_model or settings.ACTIVE_LOCAL_MODEL
    remote_model = req.remote_model or settings.ACTIVE_REMOTE_MODEL
    remote_model = resolve_remote_model(remote_model)
    threshold = req.threshold or settings.DEFAULT_CONSISTENCY_THRESHOLD

    async def stream_generator():
        async def async_iterate_stream(stream):
            loop = asyncio.get_running_loop()
            stream_iter = iter(stream)
            last_chunk_time = time.time()
            
            while True:
                try:
                    chunk_task = loop.run_in_executor(None, next, stream_iter)
                    chunk = await asyncio.wait_for(chunk_task, timeout=10.0)
                    last_chunk_time = time.time()
                    yield chunk
                except asyncio.TimeoutError:
                    if time.time() - last_chunk_time > 30.0:
                        yield {"error": "Stream timed out (30s) waiting for response from provider"}
                        break
                    else:
                        yield {"event": "heartbeat"}
                except StopIteration:
                    break
                except Exception as e:
                    yield {"error": f"Stream error: {str(e)}"}
                    break
        # Check Cache
        if settings.ENABLE_CACHE:
            cached_entry, hit_type, sim_score = smart_cache.get(db, req.prompt)
            if cached_entry:
                route_label = f"CACHE HIT ({hit_type})"
                route_desc = f"Resolved from cache database via {hit_type.lower()} matching (similarity: {sim_score:.2f})."
                yield f"data: {json.dumps({'event': 'routing', 'route': 'cache', 'reason': route_desc})}\n\n"
                await asyncio.sleep(0.01)
                
                # Stream cached content word by word
                for word in cached_entry.response_text.split(" "):
                    yield f"data: {json.dumps({'event': 'content', 'text': word + ' '})}\n\n"
                    await asyncio.sleep(0.005)
                
                # Log transaction to DB
                db_req = RequestModel(
                    prompt=req.prompt,
                    routed_to="cache",
                    final_route=route_label,
                    route_reason=route_desc,
                    latency_ms=0.0,
                    prompt_tokens=cached_entry.prompt_tokens,
                    completion_tokens=cached_entry.completion_tokens,
                    cost=0.0
                )
                db.add(db_req)
                db.flush()
                
                db_resp = ResponseModel(
                    request_id=db_req.id,
                    response_text=cached_entry.response_text,
                    confidence_score=round(sim_score, 2),
                    is_cached=True
                )
                db.add(db_resp)
                db.commit()
                
                # Final done event
                yield f"data: {json.dumps({'event': 'done', 'id': db_req.id, 'latency_ms': 0.0, 'prompt_tokens': cached_entry.prompt_tokens, 'completion_tokens': cached_entry.completion_tokens, 'estimated_cost': 0.0, 'route': route_label, 'confidence_score': round(sim_score, 2), 'intent': 'general_qa', 'compute_backend': get_hardware_info()['compute_backend']})}\n\n"
                return

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
        word_count = len(req.prompt.split())

        if route_name == "local":
            # Bypass self-consistency check for low-risk, conversational, general QA, or short tasks (<= 15 words)
            bypass_consistency = (
                category in ["conversation", "general_qa", "translation", "creative_writing", "summarization", "extraction"] 
                or word_count <= 15
            )
            
            if bypass_consistency:
                s1, total_p, total_c = groq_local.generate(req.prompt, local_model)
                sim = 1.0
                p_tok += total_p
                c_tok += total_c
                draft_text = s1
                confidence = 1.0
            else:
                # Run self-consistency check for high-stakes math/logic reasoning tasks
                sim, s1, s2, total_p, total_c = consistency_checker.check_consistency(req.prompt, local_model, threshold)
                p_tok += total_p
                c_tok += total_c
                draft_text = s1
                confidence = sim

            # Check if local model generation failed with an error message (e.g. rate limit 429)
            if s1 and s1.startswith("Error"):
                final_route = "REMOTE (FALLBACK - LOCAL UNAVAILABLE)"
                route_reason = f"Local provider rate limited or unavailable ({s1[:60]}...). Executed remote fallback directly."
                prov = get_remote_provider(remote_model)
                stream = prov.generate_stream(req.prompt, remote_model)
                chunk = {}
                async for stream_chunk in async_iterate_stream(stream):
                    if "event" in stream_chunk and stream_chunk["event"] == "heartbeat":
                        yield f"data: {json.dumps({'event': 'heartbeat'})}\n\n"
                        continue
                    if "error" in stream_chunk:
                        yield f"data: {json.dumps({'event': 'error', 'error': stream_chunk['error']})}\n\n"
                        break
                    
                    chunk = stream_chunk
                    delta = chunk.get("text", "")
                    ans_accumulator.append(delta)
                    yield f"data: {json.dumps({'event': 'content', 'text': delta})}\n\n"
                    await asyncio.sleep(0.005)
                p_tok += chunk.get("prompt_tokens", 0)
                c_tok += chunk.get("completion_tokens", 0)
                confidence = 1.0
            else:
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
                    stream = prov.verify_draft_stream(req.prompt, s1, remote_model)
                    chunk = {}
                    async for stream_chunk in async_iterate_stream(stream):
                        if "event" in stream_chunk and stream_chunk["event"] == "heartbeat":
                            yield f"data: {json.dumps({'event': 'heartbeat'})}\n\n"
                            continue
                        if "error" in stream_chunk:
                            yield f"data: {json.dumps({'event': 'error', 'error': stream_chunk['error']})}\n\n"
                            break
                        
                        chunk = stream_chunk
                        delta = chunk.get("text", "")
                        ans_accumulator.append(delta)
                        yield f"data: {json.dumps({'event': 'content', 'text': delta})}\n\n"
                        await asyncio.sleep(0.005)
                    p_tok += chunk.get("prompt_tokens", 0)
                    c_tok += chunk.get("completion_tokens", 0)
                else:
                    # Stream trusted local response to UI
                    yield f"data: {json.dumps({'event': 'status', 'text': 'Streaming trusted local response...'})}\n\n"
                    await asyncio.sleep(0.01)
                    for word in s1.split(" "):
                        ans_accumulator.append(word + " ")
                        yield f"data: {json.dumps({'event': 'content', 'text': word + ' '})}\n\n"
                        await asyncio.sleep(0.01)
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
            async for stream_chunk in async_iterate_stream(stream):
                if "event" in stream_chunk and stream_chunk["event"] == "heartbeat":
                    yield f"data: {json.dumps({'event': 'heartbeat'})}\n\n"
                    continue
                if "error" in stream_chunk:
                    yield f"data: {json.dumps({'event': 'error', 'error': stream_chunk['error']})}\n\n"
                    break
                
                chunk = stream_chunk
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
            user_id=user_id,
            user_email=user_email.strip().lower() if user_email else None,
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
        if settings.ENABLE_CACHE and full_ans and not full_ans.startswith("Error"):
            smart_cache.set(db, req.prompt, full_ans, remote_model if "remote" in final_route.lower() else local_model, p_tok, c_tok, latency)

        # Send final details event
        yield f"data: {json.dumps({'event': 'done', 'id': db_req.id, 'latency_ms': latency, 'prompt_tokens': p_tok, 'completion_tokens': c_tok, 'estimated_cost': cost, 'route': final_route, 'confidence_score': confidence, 'intent': category, 'compute_backend': get_hardware_info()['compute_backend']})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@router.get("/analytics", response_model=AnalyticsSummary)
def get_analytics(request: Request = None, user_email: Optional[str] = None, db: Session = Depends(get_db)):
    resolved_email = user_email or get_current_user_email(request)
    return analytics_engine.get_summary(db, user_email=resolved_email)

@router.get("/analytics/cache-performance")
def get_cache_performance(db: Session = Depends(get_db)):
    """
    Returns real-time exact vs semantic vector cache performance metrics.
    """
    from sqlalchemy import func
    exact_hits = db.query(func.count(CacheEventModel.id)).filter(CacheEventModel.hit_type == "EXACT").scalar() or 0
    semantic_hits = db.query(func.count(CacheEventModel.id)).filter(CacheEventModel.hit_type == "SEMANTIC").scalar() or 0
    misses = db.query(func.count(CacheEventModel.id)).filter(CacheEventModel.hit_type == "MISS").scalar() or 0
    
    total = exact_hits + semantic_hits + misses
    
    exact_rate = (exact_hits / total * 100) if total > 0 else 0.0
    semantic_rate = (semantic_hits / total * 100) if total > 0 else 0.0
    total_hit_rate = ((exact_hits + semantic_hits) / total * 100) if total > 0 else 0.0
    semantic_boost = (semantic_hits / (exact_hits + semantic_hits) * 100) if (exact_hits + semantic_hits) > 0 else 0.0

    return {
        "total_requests": total,
        "exact_cache_hits": exact_hits,
        "semantic_cache_hits": semantic_hits,
        "cache_misses": misses,
        "exact_hit_rate_pct": round(exact_rate, 2),
        "semantic_hit_rate_pct": round(semantic_rate, 2),
        "total_cache_hit_rate_pct": round(total_hit_rate, 2),
        "semantic_boost_pct": round(semantic_boost, 2),
        "semantic_cache_threshold": getattr(settings, "SEMANTIC_CACHE_THRESHOLD", 0.92)
    }

@router.get("/analytics/router-adaptation")
def get_router_adaptation(db: Session = Depends(get_db)):
    """
    Returns active confidence thresholds per intent category and adjustment audit log.
    """
    current_thresholds = adaptive_tuner.get_all_thresholds(db)
    logs = db.query(RouterAdjustmentLogModel).order_by(RouterAdjustmentLogModel.timestamp.desc()).limit(30).all()

    recent_adjustments = [
        {
            "id": log.id,
            "intent_category": log.intent_category,
            "old_threshold": log.old_threshold,
            "new_threshold": log.new_threshold,
            "correction_rate": log.correction_rate,
            "reason": log.reason,
            "timestamp": log.timestamp
        }
        for log in logs
    ]

    return {
        "adaptive_tuning_enabled": getattr(settings, "ENABLE_ADAPTIVE_TUNING", True),
        "default_threshold": getattr(settings, "DEFAULT_CONSISTENCY_THRESHOLD", 0.80),
        "current_thresholds": current_thresholds,
        "recent_adjustments": recent_adjustments
    }

@router.get("/analytics/provider-health")
def get_provider_health(db: Session = Depends(get_db)):
    """
    Returns real-time provider health status and failover audit log.
    """
    health_status = failover_manager.get_health_status()
    failover_logs = db.query(ProviderFailoverLogModel).order_by(ProviderFailoverLogModel.timestamp.desc()).limit(30).all()

    recent_events = [
        {
            "id": log.id,
            "failed_provider": log.failed_provider,
            "fallback_provider": log.fallback_provider,
            "error_reason": log.error_reason,
            "timestamp": log.timestamp
        }
        for log in failover_logs
    ]

    return {
        "provider_health": health_status,
        "failover_order": failover_manager.failover_order,
        "recent_failover_events": recent_events
    }

@router.get("/analytics/security")
def get_security_analytics(db: Session = Depends(get_db)):
    """
    Returns security statistics, rate limiting configuration, prompt guard status, and security audit log.
    """
    events = db.query(SecurityEventModel).order_by(SecurityEventModel.timestamp.desc()).limit(30).all()

    injection_count = db.query(SecurityEventModel).filter(SecurityEventModel.event_type == "prompt_injection").count()
    rate_limit_count = db.query(SecurityEventModel).filter(SecurityEventModel.event_type == "rate_limit_exceeded").count()

    recent_security_logs = [
        {
            "id": ev.id,
            "event_type": ev.event_type,
            "client_ip": ev.client_ip,
            "prompt_snippet": ev.prompt_snippet,
            "flagged_reasons": ev.flagged_reasons,
            "timestamp": ev.timestamp
        }
        for ev in events
    ]

    return {
        "prompt_guard_enabled": prompt_guard.enabled,
        "rate_limit_per_minute": rate_limiter.requests_per_minute,
        "total_prompt_injections_blocked": injection_count,
        "total_rate_limits_triggered": rate_limit_count,
        "recent_security_events": recent_security_logs
    }

@router.get("/history", response_model=List[ChatResponse])
def get_history(request: Request = None, user_email: Optional[str] = None, limit: int = 30, db: Session = Depends(get_db)):
    resolved_email = user_email or get_current_user_email(request)
    query = db.query(RequestModel)
    if resolved_email:
        query = query.filter(RequestModel.user_email == resolved_email.strip().lower())
    requests = query.order_by(RequestModel.timestamp.desc()).limit(limit).all()
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
            user_email=req.user_email,
            timestamp=req.timestamp.replace(tzinfo=timezone.utc)
        ))
    return history

@router.delete("/history/{id}")
def delete_history_item(id: int, request: Request = None, db: Session = Depends(get_db)):
    resolved_email = get_current_user_email(request)
    query = db.query(RequestModel).filter(RequestModel.id == id)
    if resolved_email:
        query = query.filter((RequestModel.user_email == resolved_email.strip().lower()) | (RequestModel.user_email == None))
    record = query.first()
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found or access denied.")
    db.delete(record)
    db.commit()
    return {"status": "success", "message": "Transaction deleted"}

@router.delete("/history/before-today")
def delete_history_before_today(request: Request = None, db: Session = Depends(get_db)):
    from datetime import datetime, time
    today_start = datetime.combine(datetime.now().date(), time.min)
    resolved_email = get_current_user_email(request)
    query = db.query(RequestModel).filter(RequestModel.timestamp < today_start)
    if resolved_email:
        query = query.filter(RequestModel.user_email == resolved_email.strip().lower())
    deleted_count = query.delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "deleted_count": deleted_count}

@router.post("/benchmark")
def run_benchmark_endpoint(req: BenchmarkRunRequest, request: Request = None, db: Session = Depends(get_db)):
    resolved_email = req.user_email or get_current_user_email(request)
    resolved_id = req.user_id or get_current_user_id(request)
    runner = BenchmarkRunner(db)
    return runner.run_benchmark(req.benchmark_name, req.threshold, req.tasks_file, user_email=resolved_email, user_id=resolved_id)

@router.get("/benchmarks", response_model=List[BenchmarkSummary])
def get_benchmarks(request: Request = None, user_email: Optional[str] = None, limit: int = 15, db: Session = Depends(get_db)):
    resolved_email = user_email or get_current_user_email(request)
    query = db.query(BenchmarkModel)
    if resolved_email:
        query = query.filter((BenchmarkModel.user_email == resolved_email.strip().lower()) | (BenchmarkModel.user_email == None))
    b_records = query.order_by(BenchmarkModel.timestamp.desc()).limit(limit).all()
    return [
        BenchmarkSummary(
            id=b.id,
            benchmark_name=b.benchmark_name,
            timestamp=b.timestamp.replace(tzinfo=timezone.utc),
            total_tasks=b.total_tasks,
            accuracy=b.accuracy,
            remote_tokens=b.remote_tokens,
            local_tokens=b.local_tokens,
            cost=b.cost,
            savings=b.savings,
            latency_avg=b.latency_avg,
            config_json=b.config_json,
            user_email=b.user_email
        ) for b in b_records
    ]

@router.delete("/benchmarks/{id}")
def delete_benchmark(id: int, request: Request = None, db: Session = Depends(get_db)):
    resolved_email = get_current_user_email(request)
    query = db.query(BenchmarkModel).filter(BenchmarkModel.id == id)
    if resolved_email:
        query = query.filter((BenchmarkModel.user_email == resolved_email.strip().lower()) | (BenchmarkModel.user_email == None))
    record = query.first()
    if not record:
        raise HTTPException(status_code=404, detail="Benchmark not found or access denied.")
    db.delete(record)
    db.commit()
    return {"status": "success", "message": "Benchmark deleted"}

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
            
        for key, val in updates.items():
            if key not in updated_keys:
                new_lines.append(f"{key}={val}\n")
                
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception:
        pass

@router.get("/settings", response_model=SettingsPayload)
def get_settings(request: Request = None, user_email: Optional[str] = None, db: Session = Depends(get_db)):
    resolved_email = user_email or get_current_user_email(request)
    
    # Check if user has individual settings in UserSettingsModel
    if resolved_email:
        user_sett = db.query(UserSettingsModel).filter(UserSettingsModel.user_email == resolved_email.strip().lower()).first()
        if user_sett:
            keys_dict = {}
            if user_sett.api_keys_json:
                try:
                    keys_dict = json.loads(user_sett.api_keys_json)
                except Exception:
                    keys_dict = {}
            return SettingsPayload(
                active_local_model=user_sett.active_local_model or settings.ACTIVE_LOCAL_MODEL,
                active_remote_model=user_sett.active_remote_model or settings.ACTIVE_REMOTE_MODEL,
                default_threshold=user_sett.default_threshold if user_sett.default_threshold is not None else settings.DEFAULT_CONSISTENCY_THRESHOLD,
                enable_cache=user_sett.enable_cache if user_sett.enable_cache is not None else settings.ENABLE_CACHE,
                enable_prompt_compression=user_sett.enable_prompt_compression if user_sett.enable_prompt_compression is not None else settings.ENABLE_PROMPT_COMPRESSION,
                compute_backend=get_hardware_info()["compute_backend"],
                user_email=resolved_email,
                fireworks_api_key=mask_api_key(keys_dict.get("fireworks_api_key") or settings.FIREWORKS_API_KEY),
                openai_api_key=mask_api_key(keys_dict.get("openai_api_key") or settings.OPENAI_API_KEY),
                anthropic_api_key=mask_api_key(keys_dict.get("anthropic_api_key") or settings.ANTHROPIC_API_KEY),
                gemini_api_key=mask_api_key(keys_dict.get("gemini_api_key") or settings.GEMINI_API_KEY),
                groq_api_key=mask_api_key(keys_dict.get("groq_api_key") or settings.GROQ_API_KEY),
                together_api_key=mask_api_key(keys_dict.get("together_api_key") or settings.TOGETHER_API_KEY)
            )

    return SettingsPayload(
        active_local_model=settings.ACTIVE_LOCAL_MODEL,
        active_remote_model=settings.ACTIVE_REMOTE_MODEL,
        default_threshold=settings.DEFAULT_CONSISTENCY_THRESHOLD,
        enable_cache=settings.ENABLE_CACHE,
        enable_prompt_compression=settings.ENABLE_PROMPT_COMPRESSION,
        compute_backend=get_hardware_info()["compute_backend"],
        user_email=resolved_email,
        fireworks_api_key=mask_api_key(settings.FIREWORKS_API_KEY),
        openai_api_key=mask_api_key(settings.OPENAI_API_KEY),
        anthropic_api_key=mask_api_key(settings.ANTHROPIC_API_KEY),
        gemini_api_key=mask_api_key(settings.GEMINI_API_KEY),
        groq_api_key=mask_api_key(settings.GROQ_API_KEY),
        together_api_key=mask_api_key(settings.TOGETHER_API_KEY)
    )

@router.post("/settings")
def update_settings(payload: SettingsPayload, request: Request = None, db: Session = Depends(get_db)):
    resolved_email = payload.user_email or get_current_user_email(request)

    # If user-specific update, save to UserSettingsModel
    if resolved_email:
        user_sett = db.query(UserSettingsModel).filter(UserSettingsModel.user_email == resolved_email.strip().lower()).first()
        if not user_sett:
            user_sett = UserSettingsModel(user_email=resolved_email.strip().lower())
            db.add(user_sett)

        user_sett.active_local_model = payload.active_local_model
        user_sett.active_remote_model = payload.active_remote_model
        user_sett.default_threshold = payload.default_threshold
        user_sett.enable_cache = payload.enable_cache
        user_sett.enable_prompt_compression = payload.enable_prompt_compression

        keys_dict = {}
        if user_sett.api_keys_json:
            try:
                keys_dict = json.loads(user_sett.api_keys_json)
            except Exception:
                keys_dict = {}

        if payload.fireworks_api_key and not is_masked(payload.fireworks_api_key):
            keys_dict["fireworks_api_key"] = payload.fireworks_api_key
        if payload.openai_api_key and not is_masked(payload.openai_api_key):
            keys_dict["openai_api_key"] = payload.openai_api_key
        if payload.anthropic_api_key and not is_masked(payload.anthropic_api_key):
            keys_dict["anthropic_api_key"] = payload.anthropic_api_key
        if payload.gemini_api_key and not is_masked(payload.gemini_api_key):
            keys_dict["gemini_api_key"] = payload.gemini_api_key
        if payload.groq_api_key and not is_masked(payload.groq_api_key):
            keys_dict["groq_api_key"] = payload.groq_api_key
        if payload.together_api_key and not is_masked(payload.together_api_key):
            keys_dict["together_api_key"] = payload.together_api_key

        user_sett.api_keys_json = json.dumps(keys_dict)
        db.commit()

    # Also update global active settings
    settings.ACTIVE_LOCAL_MODEL = payload.active_local_model
    settings.ACTIVE_REMOTE_MODEL = payload.active_remote_model
    settings.DEFAULT_CONSISTENCY_THRESHOLD = payload.default_threshold
    settings.ENABLE_CACHE = payload.enable_cache
    settings.ENABLE_PROMPT_COMPRESSION = payload.enable_prompt_compression

    return {"status": "success", "message": "Settings updated and isolated for your workspace."}

