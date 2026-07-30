import json
import requests
from typing import Tuple, Dict, Any, Generator
from app.providers.base import BaseProvider, sanitize_error_msg
from app.config import settings

class AnthropicProvider(BaseProvider):
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.ANTHROPIC_API_KEY
        self.base_url = "https://api.anthropic.com/v1/messages"

    def _get_headers(self, key: str = None) -> Dict[str, str]:
        active_key = key or self.api_key
        return {
            "x-api-key": active_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

    def generate(self, prompt: str, model: str, options: Dict[str, Any] = None) -> Tuple[str, int, int]:
        headers = self._get_headers(options.get("api_key") if options else None)
        if not headers["x-api-key"]:
            return "Error: ANTHROPIC_API_KEY is not configured.", 0, 0

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": options.get("max_tokens", 2048) if options else 2048,
            "temperature": options.get("temperature", 0.7) if options else 0.7
        }

        try:
            response = requests.post(self.base_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Extract content text list
            content_blocks = data.get("content", [])
            content = "".join([block.get("text", "") for block in content_blocks if block.get("type") == "text"])
            
            usage = data.get("usage", {})
            prompt_tokens = usage.get("input_tokens", 0)
            completion_tokens = usage.get("output_tokens", 0)
            return content, prompt_tokens, completion_tokens
        except Exception as e:
            return f"Error querying Anthropic remote model ({model}): {sanitize_error_msg(e)}", 0, 0

    def generate_stream(self, prompt: str, model: str, options: Dict[str, Any] = None) -> Generator[Dict[str, Any], None, None]:
        headers = self._get_headers(options.get("api_key") if options else None)
        if not headers["x-api-key"]:
            yield {
                "text": "Error: ANTHROPIC_API_KEY is not configured.",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "done": True
            }
            return

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": options.get("max_tokens", 2048) if options else 2048,
            "temperature": options.get("temperature", 0.7) if options else 0.7,
            "stream": True
        }

        try:
            response = requests.post(self.base_url, headers=headers, json=payload, stream=True, timeout=30)
            response.raise_for_status()
            
            prompt_tokens = 0
            completion_tokens = 0
            
            event_name = ""

            for line in response.iter_lines():
                if not line:
                    continue
                line_str = line.decode("utf-8")
                
                if line_str.startswith("event: "):
                    event_name = line_str[7:].strip()
                    continue
                
                if line_str.startswith("data: "):
                    data_str = line_str[6:].strip()
                    try:
                        data = json.loads(data_str)
                        
                        if event_name == "message_start":
                            usage = data.get("message", {}).get("usage", {})
                            prompt_tokens = usage.get("input_tokens", 0)
                            
                        elif event_name == "content_block_delta":
                            delta_text = data.get("delta", {}).get("text", "")
                            yield {
                                "text": delta_text,
                                "prompt_tokens": prompt_tokens,
                                "completion_tokens": completion_tokens,
                                "done": False
                            }
                            
                        elif event_name == "message_delta":
                            usage = data.get("usage", {})
                            completion_tokens = usage.get("output_tokens", completion_tokens)
                            
                        elif event_name == "message_stop":
                            yield {
                                "text": "",
                                "prompt_tokens": prompt_tokens,
                                "completion_tokens": completion_tokens,
                                "done": True
                            }
                            break
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            yield {
                "text": f"\n[Stream Error: {sanitize_error_msg(e)}]",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "done": True
            }
