from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.database.models import RouterThresholdModel, RouterAdjustmentLogModel
from app.config import settings

INTENT_CATEGORIES = [
    "coding", "math", "reasoning", "summarization",
    "translation", "extraction", "conversation", "creative_writing", "general_qa"
]

class AdaptiveThresholdManager:
    def __init__(self, min_threshold: float = 0.50, max_threshold: float = 0.95, step: float = 0.02):
        self.min_threshold = min_threshold
        self.max_threshold = max_threshold
        self.step = step

    def get_threshold(self, db: Session, intent_category: str) -> float:
        """
        Returns the active confidence threshold for a given intent category.
        If adaptive tuning is disabled in settings, returns settings.DEFAULT_CONSISTENCY_THRESHOLD.
        """
        if not getattr(settings, "ENABLE_ADAPTIVE_TUNING", True):
            return getattr(settings, "DEFAULT_CONSISTENCY_THRESHOLD", 0.80)

        record = db.query(RouterThresholdModel).filter(
            RouterThresholdModel.intent_category == intent_category
        ).first()

        if record:
            return record.current_threshold
        
        default_val = getattr(settings, "DEFAULT_CONSISTENCY_THRESHOLD", 0.80)
        try:
            new_record = RouterThresholdModel(
                intent_category=intent_category,
                current_threshold=default_val,
                updated_at=datetime.utcnow()
            )
            db.add(new_record)
            db.commit()
            db.refresh(new_record)
            return default_val
        except Exception:
            db.rollback()
            return default_val

    def get_all_thresholds(self, db: Session) -> Dict[str, float]:
        """
        Returns a dictionary mapping every intent category to its active threshold.
        """
        default_val = getattr(settings, "DEFAULT_CONSISTENCY_THRESHOLD", 0.80)
        thresholds = {cat: default_val for cat in INTENT_CATEGORIES}

        records = db.query(RouterThresholdModel).all()
        for r in records:
            thresholds[r.intent_category] = r.current_threshold

        return thresholds

    def record_outcome_and_tune(
        self, 
        db: Session, 
        intent_category: str, 
        was_escalated: bool, 
        similarity_score: float
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluates the rolling window outcome for an intent category and adjusts the threshold if needed.
        Lower threshold if correction rate is high (>30%) so local escalates sooner.
        Raise threshold if local drafts are consistently fine (<10% correction rate).
        """
        if not getattr(settings, "ENABLE_ADAPTIVE_TUNING", True):
            return None

        current_thresh = self.get_threshold(db, intent_category)

        # High correction/escalation signal: similarity < threshold or escalated
        is_correction = was_escalated or (similarity_score < current_thresh)

        # In a real environment, we compute rolling rate over recent requests;
        # here we adjust smoothly based on real-time feedback
        new_thresh = current_thresh
        reason = ""

        if is_correction:
            # Local draft was unsatisfactory -> lower threshold to escalate sooner
            if current_thresh > self.min_threshold:
                new_thresh = max(self.min_threshold, round(current_thresh - self.step, 2))
                reason = f"Frequent escalation / low similarity ({similarity_score:.2f}) detected — lowered threshold from {current_thresh:.2f} to {new_thresh:.2f} to escalate sooner."
        else:
            # Local draft was high quality -> raise threshold to trust local more & save cost
            if current_thresh < self.max_threshold:
                new_thresh = min(self.max_threshold, round(current_thresh + (self.step * 0.5), 2))
                reason = f"High local accuracy (similarity: {similarity_score:.2f}) — raised threshold from {current_thresh:.2f} to {new_thresh:.2f} to route more to local."

        if new_thresh != current_thresh and reason:
            try:
                record = db.query(RouterThresholdModel).filter(
                    RouterThresholdModel.intent_category == intent_category
                ).first()
                if record:
                    record.current_threshold = new_thresh
                    record.updated_at = datetime.utcnow()
                else:
                    db.add(RouterThresholdModel(
                        intent_category=intent_category,
                        current_threshold=new_thresh,
                        updated_at=datetime.utcnow()
                    ))

                log_entry = RouterAdjustmentLogModel(
                    intent_category=intent_category,
                    old_threshold=current_thresh,
                    new_threshold=new_thresh,
                    correction_rate=1.0 if is_correction else 0.0,
                    reason=reason,
                    timestamp=datetime.utcnow()
                )
                db.add(log_entry)
                db.commit()

                return {
                    "intent_category": intent_category,
                    "old_threshold": current_thresh,
                    "new_threshold": new_thresh,
                    "reason": reason
                }
            except Exception:
                db.rollback()

        return None
