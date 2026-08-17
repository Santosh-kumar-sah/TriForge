import json
import requests
from typing import Tuple, Dict, Any, Generator
from app.providers.base import BaseProvider, sanitize_error_msg
from app.config import settings


class GroqProvider(BaseProvider):
    """
    Groq API provider — replaces LocalOllamaProvider for cloud deployments.
    Uses Groq's OpenAI-compatible API endpoint.
    Groq is free with generous rate limits and extremely fast inference.
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

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
        fallback_models = [model, "openai/gpt-oss-20b", "groq/compound"]
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
                if response.status_code == 429 and target_model != fallback_models[-1]:
                    # Rate limited on current model — silently try next high-throughput model
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
                if "429" in str(e) and target_model != fallback_models[-1]:
                    continue
                break

        # Graceful fallback — never crash or leak API key in error message
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
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": options.get("temperature", 0.7) if options else 0.7,
            "stream": True,
        }

        try:
            response = requests.post(
                self.base_url, headers=headers, json=payload, stream=True, timeout=30
            )
            response.raise_for_status()

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

        except Exception as e:
            yield {
                "text": f"\n[Stream Error: {sanitize_error_msg(e)}]",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "done": True,
            }
