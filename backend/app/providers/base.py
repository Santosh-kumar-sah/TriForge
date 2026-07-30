from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any, Generator
import re

KEY_PATTERNS = re.compile(
    r'(gsk_[A-Za-z0-9_-]+|fw_[A-Za-z0-9_-]+|sk-ant-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|key-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)',
    re.IGNORECASE
)

def sanitize_error_msg(msg: Any) -> str:
    """
    Sanitizes error messages to ensure API keys and Bearer tokens are never
    leaked to clients or logged in plain text.
    """
    if not msg:
        return ""
    clean_str = str(msg)
    return KEY_PATTERNS.sub("[REDACTED_API_KEY]", clean_str)


class BaseProvider(ABC):
    """
    Abstract Base class for all model execution providers (Local & Remote).
    """

    @abstractmethod
    def generate(self, prompt: str, model: str, options: Dict[str, Any] = None) -> Tuple[str, int, int]:
        """
        Executes a prompt synchronously.
        Returns:
            Tuple[str, int, int]: (response_text, prompt_tokens, completion_tokens)
        """
        pass

    @abstractmethod
    def generate_stream(self, prompt: str, model: str, options: Dict[str, Any] = None) -> Generator[Dict[str, Any], None, None]:
        """
        Executes a prompt and streams the response back.
        Yields:
            Dict[str, Any]: A chunk containing token info or delta text.
        """
        pass

    def verify_draft(self, prompt: str, draft: str, model: str, options: Dict[str, Any] = None) -> Tuple[str, int, int]:
        """
        Sends the original prompt and local draft to the remote model for verification.
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
        return self.generate(verification_prompt, model, options)

    def verify_draft_stream(self, prompt: str, draft: str, model: str, options: Dict[str, Any] = None) -> Generator[Dict[str, Any], None, None]:
        """
        Streams the remote model verification of the local draft response.
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
        return self.generate_stream(verification_prompt, model, options)
