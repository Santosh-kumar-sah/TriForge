# router.py
#
# Smart 3-tier routing engine for the TriForge Hybrid Token-Efficient Agent.
#
# SCORING LOGIC:
#   - Local Ollama calls  →  0 Fireworks tokens  →  BEST for score
#   - Fireworks Tier 1    →  cheapest model (3B)  →  use when local won't work
#   - Fireworks Tier 2    →  standard model (8B)  →  use only when tier1 insufficient
#
# ROUTING RETURNS: ("local" | "remote_tier1" | "remote_tier2", reason)

import re


# ──────────────────────────────────────────────────────────────────────────────
# Internal task classifier
# ──────────────────────────────────────────────────────────────────────────────

def _classify(task_text: str) -> str:
    """
    Classifies the task into a semantic category for routing.
    Returns one of: factual | simple_math | complex_math | code_gen |
                    summarization | translation | general
    """
    t = task_text.lower().strip()

    # ── Code GENERATION: writing/implementing actual runnable code ──
    # Must check before generic "python" / "code" keyword checks.
    code_gen_patterns = [
        r'\bwrite\s+(a\s+)?(python\s+|javascript\s+|java\s+)?function\b',
        r'\bwrite\s+(a\s+)?(python\s+)?program\b',
        r'\bwrite\s+(a\s+)?script\b',
        r'\bimplement\s+(a\s+)?\w+\s+function\b',
        r'\bcreate\s+(a\s+)?function\b',
        r'\bdefine\s+(a\s+)?function\b',
        r'\bcode\s+to\s+\w+\b',
        r'\bwrite\s+code\b',
        r'\bgenerate\s+(a\s+)?function\b',
        r'\bbuild\s+(a\s+)?function\b',
    ]
    for pattern in code_gen_patterns:
        if re.search(pattern, t):
            return "code_gen"

    # ── Code QA: questions ABOUT code (factual, not generation) ──
    # These are short factual lookups — local model handles fine.
    code_qa_patterns = [
        r'\bwhat\s+(standard\s+)?python\s+keyword\b',
        r'\bwhat\s+(python\s+)?(keyword|built-in|method|function)\s+(is|does|handles)\b',
        r'\bwhich\s+(python\s+)?(keyword|statement|clause)\b',
        r'\bwhat\s+does\s+\b(try|except|finally|with|yield|lambda|async|await)\b',
    ]
    for pattern in code_qa_patterns:
        if re.search(pattern, t):
            return "factual"   # Treat as simple factual lookup

    # ── Complex math / algebra (with variables or multi-step) ──
    # Qwen2.5:3B can handle simple algebra — route LOCAL, escalate if needed.
    if re.search(
        r'\bsolve\b.*[xyz]|\b[xyz]\s*[\+\-]\s*\d|\bequation\b|\balgebra\b'
        r'|\bfind\s+(the\s+value|x\b)|\bx\s*=|what\s+is\s+x\b',
        t
    ):
        return "complex_math"

    # ── Simple arithmetic (single expression, no variables) ──
    if re.search(
        r'\b\d[\d,]*\s*[\*\+\-\/]\s*\d[\d,]*(\s*[\*\+\-\/]\s*\d[\d,]*)?\b'
        r'|\b(what\s+is|calculate|compute)\s+[\d,]+',
        t
    ):
        return "simple_math"

    # ── Summarization ──
    if re.search(
        r'\bsummar(ize|y|ise|ization)\b|\bin\s+\d+\s+words?\b'
        r'|\bone[\-\s]sentence\b|\bshorten\b|\bparaphrase\b',
        t
    ):
        return "summarization"

    # ── Translation ──
    if re.search(r'\btranslat(e|ion)\b|\bin\s+(french|spanish|german|hindi|japanese|mandarin)\b', t):
        return "translation"

    # ── Conversation / Greetings ──
    if any(t.startswith(kw) for kw in [
        "hello", "hi", "hey", "how are you", "what's up", "good morning", "good afternoon"
    ]) and len(t.split()) < 6:
        return "conversation"

    # ── Factual lookups ──
    if re.search(
        r'\bwhat\s+is\b|\bwho\s+(is|was|painted|invented|discovered|wrote|created)\b'
        r'|\bwhich\s+(planet|country|city|element|language)\b'
        r'|\bwhen\s+(did|was|is)\b|\bwhere\s+(is|was|are)\b'
        r'|\bhow\s+many\b|\bname\s+(the|a)\b|\bwhat\s+year\b',
        t
    ):
        return "factual"

    return "general"


# ──────────────────────────────────────────────────────────────────────────────
# Public routing function
# ──────────────────────────────────────────────────────────────────────────────

def route(task_text: str) -> tuple[str, str]:
    """
    Smart routing function that minimises Fireworks token expenditure.

    Returns:
        tuple[str, str]: (route_name, reason)
            route_name  →  "local" | "remote_tier1" | "remote_tier2"
            reason      →  human-readable explanation of the decision
    """
    category  = _classify(task_text)
    word_count = len(task_text.split())

    # ── Code generation: must use Fireworks (local 3B unreliable for synthesis) ──
    if category == "code_gen":
        reason = (
            f"Code generation task detected (category=code_gen). "
            f"Routing to Fireworks Tier 1 (cheapest model) for reliable code synthesis."
        )
        return "remote_tier1", reason

    # ── Conversation / Greetings ──
    if category == "conversation":
        reason = (
            f"Conversation query ({word_count} words) — "
            f"handled locally with zero Fireworks token cost."
        )
        return "local", reason

    # ── Simple factual / short math / code QA / translation → always local ──
    if category in ("factual", "simple_math", "translation"):
        reason = (
            f"Category '{category}' ({word_count} words) — "
            f"local Ollama model handles this reliably at zero Fireworks token cost."
        )
        return "local", reason

    # ── Complex math → try local first (agent escalates on low confidence) ──
    if category == "complex_math":
        reason = (
            f"Algebraic/complex math ({word_count} words) — "
            f"routing to local model; agent will escalate via verify-draft if confidence is low."
        )
        return "local", reason

    # ── Summarization: short inputs → local; very long inputs → Tier 1 ──
    if category == "summarization":
        if word_count > 120:
            reason = (
                f"Long summarization ({word_count} words) — "
                f"routing to Fireworks Tier 1 for better long-context handling."
            )
            return "remote_tier1", reason
        reason = (
            f"Short summarization ({word_count} words) — "
            f"local model is sufficient at zero Fireworks token cost."
        )
        return "local", reason

    # ── General / unknown → local first (agent will escalate if needed) ──
    reason = (
        f"General query ({word_count} words, category='{category}') — "
        f"routing to local to conserve Fireworks tokens."
    )
    return "local", reason
