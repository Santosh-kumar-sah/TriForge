from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class ChatRequest(BaseModel):
    prompt: str = Field(..., description="The query to process")
    local_model: Optional[str] = Field(None, description="Force a specific local model")
    remote_model: Optional[str] = Field(None, description="Force a specific remote model")
    threshold: Optional[float] = Field(None, description="Override self-consistency threshold")
    user_id: Optional[str] = Field(None, description="Authenticated user ID")
    user_email: Optional[str] = Field(None, description="Authenticated user email")

class ChatResponse(BaseModel):
    id: int
    prompt: str
    response_text: str
    route: str
    reason: str
    latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    estimated_cost: float
    confidence_score: float
    is_cached: bool
    draft_text: Optional[str] = None
    intent: Optional[str] = "general_qa"
    compute_backend: Optional[str] = "CPU"
    user_email: Optional[str] = None
    timestamp: datetime

class RouterExplanationRequest(BaseModel):
    prompt: str

class RouterExplanationResponse(BaseModel):
    prompt: str
    route: str
    reason: str
    word_count: int
    detected_category: str
    estimated_local_latency_ms: float
    estimated_remote_latency_ms: float
    estimated_remote_cost: float

class AnalyticsSummary(BaseModel):
    total_requests: int
    local_requests: int
    remote_requests: int
    escalated_requests: int
    tokens_spent_remote: int
    tokens_spent_local: int
    tokens_saved_local: int
    estimated_cost_usd: float
    estimated_savings_usd: float
    cache_hit_rate: float
    average_latency_ms: float
    energy_saved_kwh: float = 0.0
    co2_saved_kg: float = 0.0
    phone_charges_saved: int = 0
    compute_backend: Optional[str] = "CPU"
    user_email: Optional[str] = None
    daily_stats: Optional[List[Dict[str, Any]]] = None

class BenchmarkRunRequest(BaseModel):
    benchmark_name: str = "Standard Sweep"
    tasks_file: Optional[str] = None
    threshold: float = 0.8
    user_id: Optional[str] = None
    user_email: Optional[str] = None

class BenchmarkSummary(BaseModel):
    id: int
    benchmark_name: str
    timestamp: datetime
    total_tasks: int
    accuracy: float
    remote_tokens: int
    local_tokens: int
    cost: float
    savings: float
    latency_avg: float
    config_json: Optional[str] = None
    user_email: Optional[str] = None

class SettingsPayload(BaseModel):
    active_local_model: str
    active_remote_model: str
    default_threshold: float
    enable_cache: bool
    enable_prompt_compression: bool
    compute_backend: Optional[str] = None
    user_email: Optional[str] = None
    fireworks_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    together_api_key: Optional[str] = None
