from sqlalchemy import func, case
from sqlalchemy.orm import Session
from app.database.models import RequestModel, ResponseModel
from datetime import datetime, timedelta
from app.utils.hardware_detect import get_hardware_info

class AnalyticsEngine:
    def __init__(self):
        # Estimated cost configuration per token
        self.remote_cost_per_token = 0.20 / 1_000_000  # $0.20 per 1M tokens

    def get_summary(self, db: Session) -> dict:
        hw_info = get_hardware_info()
        compute_backend = hw_info["compute_backend"]
        kwh_rate = hw_info["kwh_per_1k_tokens"]

        # Single aggregated query for overall metrics
        agg = db.query(
            func.count(RequestModel.id).label("total"),
            func.sum(case((RequestModel.routed_to == "local", 1), else_=0)).label("local_reqs"),
            func.sum(case((RequestModel.routed_to == "remote", 1), else_=0)).label("remote_reqs"),
            func.sum(case((RequestModel.final_route.like("%ESCALATED%"), 1), else_=0)).label("escalated_reqs"),
            func.sum(case((RequestModel.final_route.like("%REMOTE%"), RequestModel.prompt_tokens + RequestModel.completion_tokens), else_=0)).label("r_spent"),
            func.sum(case((RequestModel.final_route == "LOCAL", RequestModel.prompt_tokens + RequestModel.completion_tokens), else_=0)).label("l_spent"),
            func.sum(RequestModel.latency_ms).label("total_latency")
        ).first()

        total = (agg.total or 0) if agg else 0
        if total == 0:
            return {
                "total_requests": 0,
                "local_requests": 0,
                "remote_requests": 0,
                "escalated_requests": 0,
                "tokens_spent_remote": 0,
                "tokens_spent_local": 0,
                "tokens_saved_local": 0,
                "estimated_cost_usd": 0.0,
                "estimated_savings_usd": 0.0,
                "cache_hit_rate": 0.0,
                "average_latency_ms": 0.0,
                "energy_saved_kwh": 0.0,
                "co2_saved_kg": 0.0,
                "phone_charges_saved": 0,
                "compute_backend": compute_backend,
                "daily_stats": []
            }

        local_reqs = int(agg.local_reqs or 0)
        remote_reqs = int(agg.remote_reqs or 0)
        escalated_reqs = int(agg.escalated_reqs or 0)
        r_spent = int(agg.r_spent or 0)
        l_spent = int(agg.l_spent or 0)

        # Cached requests count and saved tokens
        cached_stats = db.query(
            func.count(ResponseModel.id).label("count"),
            func.sum(RequestModel.prompt_tokens + RequestModel.completion_tokens).label("saved_tokens")
        ).join(RequestModel, ResponseModel.request_id == RequestModel.id)\
         .filter(ResponseModel.is_cached == True).first()

        cached_count = (cached_stats.count or 0) if cached_stats else 0
        cache_saved_tokens = (cached_stats.saved_tokens or 0) if cached_stats else 0
        cache_hit_rate = (cached_count / total) * 100

        tokens_saved = l_spent + cache_saved_tokens

        # Cost and Savings Calculations
        est_cost = r_spent * self.remote_cost_per_token
        est_savings = tokens_saved * self.remote_cost_per_token

        energy_saved_kwh = (tokens_saved / 1000.0) * kwh_rate
        co2_saved_kg = energy_saved_kwh * 0.385
        phone_charges_saved = int(energy_saved_kwh * 80)

        avg_latency = (agg.total_latency or 0.0) / total if agg else 0.0

        # Last 7 days daily statistics via single aggregated query
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        
        try:
            daily_records = db.query(
                func.date(RequestModel.timestamp).label("day"),
                func.count(RequestModel.id).label("count"),
                func.sum(RequestModel.latency_ms).label("latency_sum"),
                func.sum(
                    case((RequestModel.final_route.like("%REMOTE%"), RequestModel.prompt_tokens + RequestModel.completion_tokens), else_=0)
                ).label("remote_tokens"),
                func.sum(
                    case((RequestModel.final_route == "LOCAL", RequestModel.prompt_tokens + RequestModel.completion_tokens), else_=0)
                ).label("local_tokens")
            ).filter(RequestModel.timestamp >= seven_days_ago)\
             .group_by(func.date(RequestModel.timestamp))\
             .order_by(func.date(RequestModel.timestamp))\
             .all()
        except Exception:
            daily_records = []

        daily_stats = []
        for rec in daily_records:
            if rec.day is None:
                continue
            day_str = str(rec.day)
            count = rec.count or 0
            avg_day_latency = (rec.latency_sum / count) if count > 0 else 0.0
            daily_cost = (rec.remote_tokens or 0) * self.remote_cost_per_token
            daily_savings = (rec.local_tokens or 0) * self.remote_cost_per_token

            daily_stats.append({
                "date": day_str,
                "requests": count,
                "latency_ms": round(avg_day_latency, 2),
                "cost_usd": round(daily_cost, 6),
                "savings_usd": round(daily_savings, 6)
            })

        return {
            "total_requests": total,
            "local_requests": local_reqs,
            "remote_requests": remote_reqs,
            "escalated_requests": escalated_reqs,
            "tokens_spent_remote": r_spent,
            "tokens_spent_local": l_spent,
            "tokens_saved_local": tokens_saved,
            "estimated_cost_usd": round(est_cost, 6),
            "estimated_savings_usd": round(est_savings, 6),
            "cache_hit_rate": round(cache_hit_rate, 2),
            "average_latency_ms": round(avg_latency, 2),
            "energy_saved_kwh": round(energy_saved_kwh, 4),
            "co2_saved_kg": round(co2_saved_kg, 4),
            "phone_charges_saved": phone_charges_saved,
            "compute_backend": compute_backend,
            "daily_stats": daily_stats
        }
