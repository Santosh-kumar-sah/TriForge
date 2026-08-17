import re
from typing import Dict, List, Any, Tuple

INJECTION_PATTERNS = [
    (r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)", "instruction_override"),
    (r"disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)", "instruction_override"),
    (r"forget\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)", "instruction_override"),
    (r"you\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken|DAN|developer\s+mode)", "jailbreak_attempt"),
    (r"bypass\s+(safety|content|ethical)\s+(filters|rules|guidelines)", "jailbreak_attempt"),
    (r"reveal\s+(your|the)\s+(system\s+prompt|developer\s+instructions|hidden\s+rules)", "system_prompt_leak"),
    (r"print\s+(your|the)\s+(system\s+prompt|initial\s+prompt|system\s+message)", "system_prompt_leak"),
    (r"\[SYSTEM\s+NOTE\]", "fake_system_injection"),
    (r"<\|im_start\|>system", "chatml_injection_attack"),
    (r"DO\s+NOT\s+FOLLOW\s+THE\s+ABOVE", "instruction_override")
]

class PromptGuard:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.compiled_patterns = [(re.compile(pat, re.IGNORECASE), reason) for pat, reason in INJECTION_PATTERNS]

    def inspect(self, prompt: str) -> Tuple[bool, List[str]]:
        """
        Inspects incoming prompt for malicious prompt injection or jailbreak patterns.
        Returns: Tuple[is_flagged, List[reasons]]
        """
        if not self.enabled or not prompt:
            return False, []

        flagged_reasons = []
        for pattern, reason in self.compiled_patterns:
            if pattern.search(prompt):
                if reason not in flagged_reasons:
                    flagged_reasons.append(reason)

        return len(flagged_reasons) > 0, flagged_reasons
