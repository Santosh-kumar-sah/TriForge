import time
from typing import Dict, List, Tuple, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.database.models import ProviderFailoverLogModel
from app.providers.groq_provider import GroqProvider
from app.providers.remote_fireworks import RemoteFireworksProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import sanitize_error_msg
from app.config import settings

class ProviderHealthManager:
    def __init__(self, cache_ttl_sec: int = 45):
        self.cache_ttl_sec = cache_ttl_sec
        self.providers = {
            "groq": GroqProvider(),
            "fireworks": RemoteFireworksProvider(),
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
        }
        
        # Priority order for failover execution
        self.failover_order = ["groq", "openai", "anthropic", "fireworks"]

        # Health status cache: {name: {"status": str, "last_checked": float, "failures": int}}
        self.health_cache = {
            name: {"status": "healthy", "last_checked": 0.0, "failures": 0}
            for name in self.providers
        }

    def _check_key_configured(self, name: str) -> bool:
        """Checks if provider has a valid API key configured."""
        if name == "groq":
            key = settings.GROQ_API_KEY
        elif name == "fireworks":
            key = settings.FIREWORKS_API_KEY
        elif name == "openai":
            key = settings.OPENAI_API_KEY
        elif name == "anthropic":
            key = settings.ANTHROPIC_API_KEY
        else:
            key = ""

        if not key or "placeholder" in key.lower() or "your_" in key.lower() or key.startswith("key_"):
            return False
        return True

    def get_health_status(self) -> Dict[str, Any]:
        """Returns current cached health status of all providers."""
        now = time.time()
        res = {}
        for name, info in self.health_cache.items():
            is_key_set = self._check_key_configured(name)
            status = info["status"]
            if not is_key_set and status == "healthy":
                status = "unconfigured"

            last_sec = round(max(0.0, now - info["last_checked"]), 1) if info["last_checked"] > 0 else 0.0

            res[name] = {
                "status": status,
                "consecutive_failures": info["failures"],
                "last_checked_sec_ago": last_sec,
                "is_configured": is_key_set
            }
        return res

    def mark_success(self, name: str):
        """Marks a provider as healthy on successful completion."""
        self.health_cache[name] = {
            "status": "healthy",
            "last_checked": time.time(),
            "failures": 0
        }

    def mark_failure(self, name: str, reason: str, db: Session = None, fallback_name: str = "none"):
        """Marks a provider as degraded or down on error and logs to DB."""
        current = self.health_cache.get(name, {"status": "healthy", "last_checked": 0.0, "failures": 0})
        failures = current["failures"] + 1
        status = "degraded" if failures < 3 else "down"

        self.health_cache[name] = {
            "status": status,
            "last_checked": time.time(),
            "failures": failures
        }

        if db:
            try:
                log_entry = ProviderFailoverLogModel(
                    failed_provider=name,
                    fallback_provider=fallback_name,
                    error_reason=sanitize_error_msg(reason),
                    timestamp=datetime.utcnow()
                )
                db.add(log_entry)
                db.commit()
            except Exception:
                db.rollback()

    def generate_with_failover(
        self, 
        prompt: str, 
        preferred_provider_name: str, 
        model: str, 
        db: Session = None,
        max_attempts: int = 3
    ) -> Tuple[str, int, int, str]:
        """
        Executes prompt generation with automatic failover fallback sequence.
        Returns: Tuple[response_text, prompt_tokens, completion_tokens, used_provider_name]
        """
        # Determine sequence starting with preferred provider
        order = [preferred_provider_name] + [p for p in self.failover_order if p != preferred_provider_name]
        
        attempt_count = 0
        last_error = ""

        for name in order:
            if attempt_count >= max_attempts:
                break

            # Skip if unconfigured or known down (unless preferred provider)
            if not self._check_key_configured(name) and name != preferred_provider_name:
                continue

            health = self.health_cache.get(name, {})
            if health.get("status") == "down" and name != preferred_provider_name:
                continue

            attempt_count += 1
            prov = self.providers.get(name)
            if not prov:
                continue

            # Determine appropriate model name per provider
            actual_model = model
            if name == "groq" and ("llama" in model.lower() or "accounts" in model.lower() or "gpt" in model.lower()):
                actual_model = "groq/compound"
            elif name == "openai" and "gpt" not in model.lower():
                actual_model = "gpt-4o-mini"
            elif name == "anthropic" and "claude" not in model.lower():
                actual_model = "claude-3-5-sonnet-20240620"
            elif name == "fireworks" and "fireworks" not in model.lower():
                actual_model = "accounts/fireworks/models/llama-v3p1-8b-instruct"

            try:
                resp, p_tok, c_tok = prov.generate(prompt, actual_model)
                if resp and not resp.startswith("Error"):
                    self.mark_success(name)
                    return resp, p_tok, c_tok, name
                else:
                    last_error = resp
                    fallback_next = order[attempt_count] if attempt_count < len(order) else "none"
                    self.mark_failure(name, resp, db, fallback_next)
            except Exception as e:
                last_error = str(e)
                fallback_next = order[attempt_count] if attempt_count < len(order) else "none"
                self.mark_failure(name, str(e), db, fallback_next)

        # If all providers fail, return clean graceful fallback error
        return f"Error: All provider failover attempts failed. Last error: {sanitize_error_msg(last_error)}", 0, 0, preferred_provider_name

    def verify_draft_with_failover(
        self, 
        prompt: str, 
        draft: str,
        preferred_provider_name: str, 
        model: str, 
        db: Session = None,
        max_attempts: int = 3
    ) -> Tuple[str, int, int, str]:
        """
        Executes remote model verification of local draft response with failover.
        """
        verification_prompt = (
            f"You are an expert verifier. Review the draft answer for the given task.\n"
            f"If the draft is correct and complete, repeat the draft answer exactly, with no additional commentary, preamble, or meta-confirmation.\n"
            f"If the draft is incorrect, incomplete, or has errors, output the corrected/completed answer only.\n"
            f"Do not include any conversational filler, meta-talk (like 'Confirmed', 'Here is the correction'), or explanations.\n\n"
            f"Task: {prompt}\n"
            f"Draft Answer: {draft}\n\n"
            f"Final Answer:"
        )
        return self.generate_with_failover(verification_prompt, preferred_provider_name, model, db, max_attempts)
