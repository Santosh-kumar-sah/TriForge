import time
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
from fastapi import Request, HTTPException
from sqlalchemy.orm import Session
from app.database.models import SecurityEventModel
from datetime import datetime

class RateLimiter:
    """
    In-memory sliding window rate limiter per client IP.
    Default: 30 requests / 60 seconds window.
    """
    def __init__(self, requests_per_minute: int = 30, window_sec: int = 60):
        self.requests_per_minute = requests_per_minute
        self.window_sec = window_sec
        self.requests_history: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, client_ip: str) -> Tuple[bool, int]:
        now = time.time()
        window_start = now - self.window_sec

        # Clean old timestamps
        history = [t for t in self.requests_history[client_ip] if t > window_start]
        self.requests_history[client_ip] = history

        if len(history) >= self.requests_per_minute:
            return False, len(history)

        self.requests_history[client_ip].append(now)
        return True, len(history) + 1

    def log_security_event(
        self, 
        db: Session, 
        event_type: str, 
        client_ip: str, 
        prompt_snippet: Optional[str] = None, 
        flagged_reasons: Optional[List[str]] = None
    ):
        """Logs security events (prompt injection, rate limit violation) to DB."""
        if not db:
            return

        try:
            reasons_str = ", ".join(flagged_reasons) if flagged_reasons else ""
            log_entry = SecurityEventModel(
                event_type=event_type,
                client_ip=client_ip,
                prompt_snippet=(prompt_snippet[:200] if prompt_snippet else None),
                flagged_reasons=reasons_str,
                timestamp=datetime.utcnow()
            )
            db.add(log_entry)
            db.commit()
        except Exception:
            db.rollback()
