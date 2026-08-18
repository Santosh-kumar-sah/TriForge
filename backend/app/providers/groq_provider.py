import json
import requests
from typing import Tuple, Dict, Any, Generator
from app.providers.base import BaseProvider, sanitize_error_msg
from app.config import settings

DEPRECATED_MODEL_MAP = {
    "llama-3.1-8b-instant": "groq/compound-mini",
    "llama3-8b-8192": "groq/compound-mini",
    "llama-3-8b": "groq/compound-mini",
    "llama-3.3-70b-versatile": "groq/compound",
    "llama3-70b-8192": "groq/compound",
    "llama-3-70b": "groq/compound",
    "mixtral-8x7b-32768": "openai/gpt-oss-20b"
}

class GroqProvider(BaseProvider):
    """
    Groq API provider — replaces LocalOllamaProvider for cloud deployments.
    Uses Groq's OpenAI-compatible API endpoint.
    Groq is free with generous rate limits and extremely fast inference.
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

    def _sanitize_model_name(self, model: str) -> str:
        if not model:
            return "groq/compound-mini"
        cleaned = model.strip().lower()
        if cleaned in DEPRECATED_MODEL_MAP:
            return DEPRECATED_MODEL_MAP[cleaned]
        return model

    def _get_headers(self, key: str = None) -> Dict[str, str]:
        active_key = key or self.api_key
        return {
            "Authorization": f"Bearer {active_key}",
            "Content-Type": "application/json",
        }

    def generate(
        self, prompt: str, model: str, options: Dict[str, Any] = None
    ) -> Tuple[str, int, int]:
        active_key = (options.get("api_key") if options else None) or self.api_key
        if not active_key:
            return "Error: GROQ_API_KEY is not configured.", 0, 0

        headers = self._get_headers(active_key)
        target = self._sanitize_model_name(model)
        fallback_models = [target, "groq/compound-mini", "openai/gpt-oss-20b", "groq/compound"]
        last_exception = None

        for target_model in fallback_models:
            payload = {
                "model": target_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": options.get("temperature", 0.7) if options else 0.7,
            }

            try:
                response = requests.post(
                    self.base_url, headers=headers, json=payload, timeout=30
                )
                if response.status_code in [404, 429, 400] and target_model != fallback_models[-1]:
                    continue

                response.raise_for_status()
                data = response.json()

                content = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                return content, prompt_tokens, completion_tokens

            except Exception as e:
                last_exception = e
                if target_model != fallback_models[-1]:
                    continue
                break

        return f"Error querying Groq model ({model}): {sanitize_error_msg(last_exception)}", 0, 0

    def generate_stream(
        self, prompt: str, model: str, options: Dict[str, Any] = None
    ) -> Generator[Dict[str, Any], None, None]:
        active_key = (options.get("api_key") if options else None) or self.api_key
        if not active_key:
            yield {
                "text": "Error: GROQ_API_KEY is not configured.",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "done": True,
            }
            return

        headers = self._get_headers(active_key)
        target = self._sanitize_model_name(model)
        fallback_models = [target, "groq/compound-mini", "openai/gpt-oss-20b", "groq/compound"]

        response = None
        for target_model in fallback_models:
            payload = {
                "model": target_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": options.get("temperature", 0.7) if options else 0.7,
                "stream": True,
            }

            try:
                res = requests.post(
                    self.base_url, headers=headers, json=payload, stream=True, timeout=30
                )
                if res.status_code in [404, 429, 400] and target_model != fallback_models[-1]:
                    continue
                res.raise_for_status()
                response = res
                break
            except Exception as e:
                if target_model != fallback_models[-1]:
                    continue
                yield {
                    "text": f"\n[Stream Error: {sanitize_error_msg(e)}]",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "done": True,
                }
                return

        if not response:
            yield {
                "text": "\n[Stream Error: All model endpoints returned an error]",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "done": True,
            }
            return

        prompt_tokens = 0
        completion_tokens = 0

        for line in response.iter_lines():
            if not line:
                continue
            line_str = line.decode("utf-8")
            if line_str.startswith("data: "):
                line_str = line_str[6:]
            if line_str.strip() == "[DONE]":
                yield {
                    "text": "",
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "done": True,
                }
                break

            try:
                data = json.loads(line_str)
                choice = data.get("choices", [{}])[0]
                content = choice.get("delta", {}).get("content", "") or ""

                usage = data.get("usage")
                if usage:
                    prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                    completion_tokens = usage.get(
                        "completion_tokens", completion_tokens
                    )

                yield {
                    "text": content,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "done": False,
                }
            except json.JSONDecodeError:
                continue
