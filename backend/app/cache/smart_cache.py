import hashlib
import json
import math
import re
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.database.models import CacheModel, CacheEventModel
from app.config import settings

class SmartCache:
    def __init__(self, semantic_threshold: Optional[float] = None):
        self.semantic_threshold = semantic_threshold if semantic_threshold is not None else getattr(settings, "SEMANTIC_CACHE_THRESHOLD", 0.92)

    @staticmethod
    def _hash_prompt(prompt: str) -> str:
        """Creates a SHA-256 hash of the cleaned prompt."""
        cleaned = prompt.strip().lower()
        return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()

    @staticmethod
    def _compute_embedding(text: str) -> List[float]:
        """
        Computes a lightweight, fast, 128-dimensional frequency & n-gram vector representation.
        Runs in <0.5ms offline with zero external package dependencies.
        """
        cleaned = re.sub(r'[^\w\s]', '', text.lower()).strip()
        words = cleaned.split()
        
        dim = 128
        vec = [0.0] * dim
        
        if not words:
            return vec
            
        # Word-level hash features
        for w in words:
            h = int(hashlib.md5(w.encode('utf-8')).hexdigest(), 16) % dim
            vec[h] += 1.0

        # Character 3-gram features for substring matching
        full_str = f" {cleaned} "
        for i in range(len(full_str) - 2):
            gram = full_str[i:i+3]
            h = int(hashlib.md5(gram.encode('utf-8')).hexdigest(), 16) % dim
            vec[h] += 0.5

        # L2 Normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
            
        return vec

    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """Computes cosine similarity between two normalized vectors."""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        return sum(a * b for a, b in zip(vec1, vec2))

    def _log_event(self, db: Session, hit_type: str, score: float):
        """Logs a cache lookup event to cache_events table for analytics metrics."""
        try:
            event = CacheEventModel(
                hit_type=hit_type,
                similarity_score=score,
                timestamp=datetime.utcnow()
            )
            db.add(event)
            db.commit()
        except Exception:
            db.rollback()

    def _is_error_response(self, text: str) -> bool:
        if not text:
            return True
        t = text.lower()
        return "stream error" in t or "404 client error" in t or "429 client error" in t or t.startswith("error")

    def get(self, db: Session, prompt: str, threshold: Optional[float] = None) -> Tuple[Optional[CacheModel], str, float]:
        """
        Looks up prompt in cache using 2-stage retrieval:
        1. Exact Match via SHA-256 hash.
        2. Semantic Similarity Match via vector embedding cosine similarity.

        Returns: (CacheModel | None, hit_type ("EXACT" | "SEMANTIC" | "MISS"), similarity_score)
        """
        sim_threshold = threshold if threshold is not None else getattr(settings, "SEMANTIC_CACHE_THRESHOLD", self.semantic_threshold)

        # Stage 1: Exact Match Check
        p_hash = self._hash_prompt(prompt)
        exact_entry = db.query(CacheModel).filter(CacheModel.prompt_hash == p_hash).first()
        if exact_entry:
            if self._is_error_response(exact_entry.response_text):
                try:
                    db.delete(exact_entry)
                    db.commit()
                except Exception:
                    db.rollback()
            else:
                self._log_event(db, "EXACT", 1.0)
                return exact_entry, "EXACT", 1.0

        # Stage 2: Semantic Similarity Check against recent cache entries
        query_vec = self._compute_embedding(prompt)
        recent_entries = db.query(CacheModel).order_by(CacheModel.timestamp.desc()).limit(200).all()

        best_match = None
        best_score = 0.0

        for entry in recent_entries:
            if not entry.embedding_json:
                continue
            if self._is_error_response(entry.response_text):
                continue
            try:
                cached_vec = json.loads(entry.embedding_json)
                score = self._cosine_similarity(query_vec, cached_vec)
                if score > best_score:
                    best_score = score
                    best_match = entry
            except Exception:
                continue

        if best_match and best_score >= sim_threshold:
            self._log_event(db, "SEMANTIC", best_score)
            return best_match, "SEMANTIC", best_score

        self._log_event(db, "MISS", 0.0)
        return None, "MISS", 0.0

    def set(
        self, 
        db: Session, 
        prompt: str, 
        response_text: str, 
        model_name: str, 
        prompt_tokens: int, 
        completion_tokens: int, 
        latency_ms: float,
        cache_type: str = "exact"
    ) -> Optional[CacheModel]:
        """Caches a prompt-response pair along with its vector embedding."""
        if self._is_error_response(response_text):
            return None
        p_hash = self._hash_prompt(prompt)
        vec = self._compute_embedding(prompt)
        vec_json = json.dumps(vec)
        
        existing = db.query(CacheModel).filter(CacheModel.prompt_hash == p_hash).first()
        if existing:
            existing.response_text = response_text
            existing.model_name = model_name
            existing.prompt_tokens = prompt_tokens
            existing.completion_tokens = completion_tokens
            existing.latency_ms = latency_ms
            existing.embedding_json = vec_json
            existing.cache_type = cache_type
            existing.timestamp = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            return existing

        cache_entry = CacheModel(
            prompt_hash=p_hash,
            prompt=prompt,
            response_text=response_text,
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            latency_ms=latency_ms,
            embedding_json=vec_json,
            cache_type=cache_type
        )
        
        try:
            db.add(cache_entry)
            db.commit()
            db.refresh(cache_entry)
            return cache_entry
        except Exception:
            db.rollback()
            return db.query(CacheModel).filter(CacheModel.prompt_hash == p_hash).first()
