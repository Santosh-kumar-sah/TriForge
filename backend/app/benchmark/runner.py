import json
import os
import time
import math
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.database.models import BenchmarkModel
from app.providers.groq_provider import GroqProvider
from app.providers.remote_fireworks import RemoteFireworksProvider
from app.router.routing_engine import RoutingEngine
from app.evaluation.consistency import ConsistencyChecker
from app.evaluation.hallucination import HallucinationDetector
from app.config import settings

class BenchmarkRunner:
    def __init__(self, db: Session):
        self.db = db
        self.groq_local = GroqProvider()  # Free Groq API provider
        self.fireworks = RemoteFireworksProvider()
        self.router = RoutingEngine()
        self.consistency = ConsistencyChecker(self.groq_local)
        self.hallucination = HallucinationDetector()

    def _load_tasks(self, tasks_file: str = None) -> list:
        # Check explicit tasks_file or standard search locations
        possible_paths = []
        if tasks_file:
            possible_paths.append(tasks_file)

        possible_paths.extend([
            os.path.join(os.path.dirname(__file__), "test_queries.json"),
            "test_queries.json",
            "sample_tasks.json",
            "../sample_tasks.json",
            "../../sample_tasks.json",
            os.path.join(os.path.dirname(__file__), "..", "..", "sample_tasks.json")
        ])

        for path in possible_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    continue

        # Fallback tasks if file cannot be read
        return [
            {"id": 1, "category": "general_qa", "task": "What is the capital of France?", "expected": ["paris"]},
            {"id": 2, "category": "factual", "task": "Who painted the Mona Lisa?", "expected": ["da vinci", "leonardo"]},
            {"id": 3, "category": "math", "task": "What is 15 multiplied by 6?", "expected": ["90"]},
            {"id": 4, "category": "coding", "task": "Write a Python function called 'add_numbers' that takes two parameters and returns their sum.", "expected": ["def add_numbers", "return"]},
            {"id": 5, "category": "summarization", "task": "Summarize in one word the topic of computers: they store data and compute information.", "expected": ["computer", "technology"]}
        ]

    @staticmethod
    def _calculate_percentiles(latencies: List[float]) -> Tuple[float, float]:
        """Calculates exact p50 and p95 latencies from a list of latency values."""
        if not latencies:
            return 0.0, 0.0
        sorted_l = sorted(latencies)
        n = len(sorted_l)

        p50_idx = max(0, math.ceil(n * 0.50) - 1)
        p95_idx = max(0, math.ceil(n * 0.95) - 1)

        return sorted_l[p50_idx], sorted_l[p95_idx]

    def _check_accuracy(self, response_text: str, expected_keywords: list) -> bool:
        resp_lower = response_text.lower()
        return all(keyword.lower() in resp_lower for keyword in expected_keywords)

    def run_benchmark(self, benchmark_name: str, threshold: float = 0.8, tasks_file: str = None) -> dict:
        tasks = self._load_tasks(tasks_file)
        total_tasks = len(tasks)

        configs = ["always_local", "always_remote", "triforge_router"]
        runs_summary = {}

        # Estimated cost rate per token ($0.20 per 1M tokens)
        remote_token_rate = 0.20 / 1_000_000

        for mode in configs:
            passed = 0
            latencies = []
            remote_tokens_spent = 0
            local_tokens_spent = 0

            for task in tasks:
                start_time = time.time()
                prompt = task["task"]
                expected = task.get("expected", [])

                ans = ""
                p_tok, c_tok = 0, 0

                if mode == "always_local":
                    ans, p_tok, c_tok = self.groq_local.generate(prompt, settings.ACTIVE_LOCAL_MODEL)
                    local_tokens_spent += (p_tok + c_tok)

                elif mode == "always_remote":
                    ans, p_tok, c_tok = self.fireworks.generate(prompt, settings.ACTIVE_REMOTE_MODEL)
                    remote_tokens_spent += (p_tok + c_tok)

                elif mode == "triforge_router":
                    # Full TriForge routing run
                    route_name, reason, estimates = self.router.route(prompt)
                    if route_name == "local":
                        # consistency check
                        sim, s1, s2, s_p, s_c = self.consistency.check_consistency(prompt, threshold=threshold)
                        local_tokens_spent += (s_p + s_c)

                        flagged_info = self.hallucination.check_hallucination_signals(s1)
                        
                        if sim < threshold or flagged_info["flagged"]:
                            # escalate
                            if not s1.startswith("Error querying Groq model"):
                                ans, r_p, r_c = self.fireworks.verify_draft(prompt, s1, settings.ACTIVE_REMOTE_MODEL)
                            else:
                                ans, r_p, r_c = self.fireworks.generate(prompt, settings.ACTIVE_REMOTE_MODEL)
                            remote_tokens_spent += (r_p + r_c)
                        else:
                            ans = s1
                    else:
                        ans, r_p, r_c = self.fireworks.generate(prompt, settings.ACTIVE_REMOTE_MODEL)
                        remote_tokens_spent += (r_p + r_c)

                latency = (time.time() - start_time) * 1000
                latencies.append(latency)

                # Check accuracy
                if self._check_accuracy(ans, expected):
                    passed += 1

            accuracy = (passed / total_tasks) * 100 if total_tasks > 0 else 0.0
            avg_latency = sum(latencies) / total_tasks if total_tasks > 0 else 0.0
            p50_latency, p95_latency = self._calculate_percentiles(latencies)
            estimated_cost = remote_tokens_spent * remote_token_rate

            runs_summary[mode] = {
                "accuracy": round(accuracy, 2),
                "latency_avg_ms": round(avg_latency, 2),
                "latency_p50_ms": round(p50_latency, 2),
                "latency_p95_ms": round(p95_latency, 2),
                "remote_tokens": remote_tokens_spent,
                "local_tokens": local_tokens_spent,
                "cost_usd": round(estimated_cost, 6)
            }

        # Calculate routing savings and narrative comparisons
        remote_cost = runs_summary["always_remote"]["cost_usd"]
        router_cost = runs_summary["triforge_router"]["cost_usd"]
        remote_acc = runs_summary["always_remote"]["accuracy"]
        router_acc = runs_summary["triforge_router"]["accuracy"]
        remote_p95 = runs_summary["always_remote"]["latency_p95_ms"]
        router_p95 = runs_summary["triforge_router"]["latency_p95_ms"]

        savings = max(0.0, remote_cost - router_cost)
        acc_pct_of_remote = round((router_acc / remote_acc * 100), 1) if remote_acc > 0 else 100.0
        cost_pct_of_remote = round((router_cost / remote_cost * 100), 1) if remote_cost > 0 else 0.0
        p95_latency_reduction_pct = round(((remote_p95 - router_p95) / remote_p95 * 100), 1) if remote_p95 > 0 else 0.0

        narrative_summary = (
            f"This router achieved {acc_pct_of_remote}% of always-remote's accuracy "
            f"at {cost_pct_of_remote}% of the cost and {max(0.0, p95_latency_reduction_pct)}% lower p95 latency."
        )

        runs_summary["narrative_summary"] = narrative_summary

        # Log router benchmark result to DB
        router_stats = runs_summary["triforge_router"]
        benchmark_entry = BenchmarkModel(
            benchmark_name=benchmark_name,
            total_tasks=total_tasks,
            accuracy=router_stats["accuracy"],
            remote_tokens=router_stats["remote_tokens"],
            local_tokens=router_stats["local_tokens"],
            cost=router_stats["cost_usd"],
            savings=round(savings, 6),
            latency_avg=router_stats["latency_avg_ms"],
            config_json=json.dumps(runs_summary)
        )

        self.db.add(benchmark_entry)
        self.db.commit()
        self.db.refresh(benchmark_entry)

        return {
            "id": benchmark_entry.id,
            "benchmark_name": benchmark_name,
            "timestamp": benchmark_entry.timestamp.isoformat(),
            "total_tasks": total_tasks,
            "results": runs_summary,
            "savings_usd": round(savings, 6),
            "narrative_summary": narrative_summary
        }
