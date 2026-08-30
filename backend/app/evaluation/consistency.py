import difflib
from typing import Tuple
from concurrent.futures import ThreadPoolExecutor
from app.providers.groq_provider import GroqProvider
from app.config import settings

class ConsistencyChecker:
    def __init__(self, local_provider: GroqProvider = None):
        self.local_provider = local_provider or GroqProvider()

    def check_consistency(self, prompt: str, model: str = None, threshold: float = None) -> Tuple[float, str, str, int, int]:
        """
        Samples the local (Groq) model twice at temperature 0.7.
        Returns:
            Tuple[float, str, str, int, int]: (similarity_score, sample1, sample2, total_prompt_tokens, total_completion_tokens)
        """
        target_model = model or settings.ACTIVE_LOCAL_MODEL
        target_threshold = threshold or settings.DEFAULT_CONSISTENCY_THRESHOLD

        # Sample concurrently using ThreadPoolExecutor to optimize latency
        with ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(self.local_provider.generate, prompt, target_model, {"temperature": 0.7, "seed": 42})
            future2 = executor.submit(self.local_provider.generate, prompt, target_model, {"temperature": 0.7, "seed": 43})

            sample1, s1_p, s1_c = future1.result()
            sample2, s2_p, s2_c = future2.result()

        total_prompt_tokens = s1_p + s2_p
        total_completion_tokens = s1_c + s2_c

        # Clean responses for comparison
        s1_clean = sample1.strip()
        s2_clean = sample2.strip()

        if not s1_clean or not s2_clean or s1_clean.startswith("Error querying Groq model") or s2_clean.startswith("Error querying Groq model"):
            return 0.0, sample1, sample2, total_prompt_tokens, total_completion_tokens

        # Fast exact match shortcut to bypass expensive SequenceMatcher
        if s1_clean == s2_clean:
            return 1.0, sample1, sample2, total_prompt_tokens, total_completion_tokens

        # Use SequenceMatcher ratio
        similarity = difflib.SequenceMatcher(None, s1_clean, s2_clean).ratio()

        return similarity, sample1, sample2, total_prompt_tokens, total_completion_tokens
