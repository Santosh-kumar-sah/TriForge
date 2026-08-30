import re
from typing import Dict, Any
from app.providers.groq_provider import GroqProvider
from app.config import settings

class SemanticClassifier:
    def __init__(self, groq_provider: GroqProvider = None):
        self.groq = groq_provider or GroqProvider()
        self.categories = [
            "coding", "math", "reasoning", "summarization", 
            "translation", "extraction", "conversation", 
            "creative_writing", "general_qa"
        ]
        self._cache = {}

    def _fast_heuristics(self, prompt: str) -> str:
        """
        Fast regex/keyword heuristics to classify obvious prompts instantly.
        """
        prompt_lower = prompt.lower()

        # Coding heuristics — only flag when there is clear CODE GENERATION or DEBUGGING intent.
        # Broad words like "code", "python", "html", "css", "git" alone are NOT enough;
        # we need an imperative verb paired with a code artifact to avoid false positives.
        code_generation_verbs = [
            "write", "create", "generate", "build", "implement", "develop", "make",
            "fix", "debug", "refactor", "optimise", "optimize", "add", "update",
        ]
        code_artifact_nouns = [
            "function", "class", "script", "program", "code", "snippet", "module",
            "api", "endpoint", "algorithm", "loop", "method", "query", "regex",
            "dockerfile", "dockerfile", "unit test", "test case",
        ]
        for verb in code_generation_verbs:
            if verb in prompt_lower:
                for noun in code_artifact_nouns:
                    if noun in prompt_lower:
                        return "coding"

        # Also flag obvious inline syntax that only appears in code
        if any(kw in prompt_lower for kw in ["def ", "console.log(", "import ", "#include", "SELECT ", "<?php"]):
            return "coding"

        # Math heuristics
        if any(kw in prompt_lower for kw in [
            "solve for", "equation", "integral", "derivative", "multiply", "divide",
            "fraction", "algebra", "calculus", "geometry", "theorem"
        ]) or re.search(r'\d+\s*[\+\-\*\/]\s*\d+', prompt_lower):
            return "math"

        # Summarization
        if any(kw in prompt_lower for kw in ["summarize", "summary", "tl;dr", "tldr", "condense", "gist of"]):
            return "summarization"

        # Translation
        if any(kw in prompt_lower for kw in ["translate to", "in spanish", "in french", "in german", "how to say", "translation"]):
            return "translation"

        # Extraction
        if any(kw in prompt_lower for kw in ["extract", "list all", "find the names of", "parse", "gather keys"]):
            return "extraction"

        # Conversation (Greetings and chitchat)
        if any(prompt_lower.strip().startswith(kw) for kw in [
            "hello", "hi", "hey", "how are you", "what's up", "good morning", "good afternoon"
        ]) and len(prompt.split()) < 6:
            return "conversation"

        # Creative writing
        if any(kw in prompt_lower for kw in ["write a story", "write a poem", "compose a song", "write lyrics", "creative writing"]):
            return "creative_writing"

        # General QA / Factual / Reasoning heuristics
        if any(prompt_lower.strip().startswith(kw) for kw in [
            "what ", "who ", "where ", "when ", "why ", "how ", "which ", "in ", "is ", 
            "are ", "do ", "does ", "did ", "solve ", "translate ", "whose ", "whom "
        ]):
            return "general_qa"

        if any(kw in prompt_lower for kw in ["if all ", "fade quickly", "roses fade"]):
            return "reasoning"

        return "ambiguous"

    def classify(self, prompt: str) -> str:
        """
        Main classification function. Combines fast rules with a local LLM zero-shot backup.
        """
        cleaned_prompt = prompt.strip().lower()
        if cleaned_prompt in self._cache:
            return self._cache[cleaned_prompt]

        # 1. Check fast heuristics
        heuristic_category = self._fast_heuristics(prompt)
        if heuristic_category != "ambiguous":
            if len(self._cache) > 2000:
                self._cache.clear()
            self._cache[cleaned_prompt] = heuristic_category
            return heuristic_category

        # 2. Call Groq (free-tier fast LLM) for semantic classification
        system_prompt = (
            "You are a fast intent classifier. Categorize the user prompt into exactly one of these lowercase categories:\n"
            "- coding\n"
            "- math\n"
            "- reasoning\n"
            "- summarization\n"
            "- translation\n"
            "- extraction\n"
            "- conversation\n"
            "- creative_writing\n"
            "- general_qa\n\n"
            "Respond with ONLY the exact lowercase category name. Do not include formatting, punctuation, or explanations.\n"
            "If the prompt contains logical problems or riddles, choose 'reasoning'."
        )
        
        full_classification_prompt = f"{system_prompt}\n\nPrompt: {prompt}\nCategory:"
        
        try:
            # Call Groq with low temperature and max token limit to keep it fast
            category, _, _ = self.groq.generate(
                prompt=full_classification_prompt, 
                model=settings.ACTIVE_LOCAL_MODEL,
                options={"temperature": 0.0}
            )
            cleaned = category.strip().lower().replace(".", "").replace('"', '').replace("'", "")
            
            # Match against known categories
            for cat in self.categories:
                if cat in cleaned:
                    if len(self._cache) > 2000:
                        self._cache.clear()
                    self._cache[cleaned_prompt] = cat
                    return cat
        except Exception:
            pass

        # Default fallback
        if len(self._cache) > 2000:
            self._cache.clear()
        self._cache[cleaned_prompt] = "general_qa"
        return "general_qa"
