from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.session import Base

class RequestModel(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    prompt = Column(Text, nullable=False)
    routed_to = Column(String(50), nullable=False)  # local, remote
    final_route = Column(String(100), nullable=False)  # LOCAL, REMOTE, LOCAL -> ESCALATED TO REMOTE
    route_reason = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    latency_ms = Column(Float, default=0.0)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    cost = Column(Float, default=0.0)

    responses = relationship("ResponseModel", back_populates="request", cascade="all, delete-orphan")

class ResponseModel(Base):
    __tablename__ = "responses"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False)
    response_text = Column(Text, nullable=False)
    confidence_score = Column(Float, default=1.0)
    is_cached = Column(Boolean, default=False)
    draft_text = Column(Text, nullable=True)

    request = relationship("RequestModel", back_populates="responses")

class CacheModel(Base):
    __tablename__ = "cache"

    id = Column(Integer, primary_key=True, index=True)
    prompt_hash = Column(String(64), unique=True, index=True, nullable=False)
    prompt = Column(Text, nullable=False)
    response_text = Column(Text, nullable=False)
    model_name = Column(String(100), nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    latency_ms = Column(Float, default=0.0)
    embedding_json = Column(Text, nullable=True)
    cache_type = Column(String(50), default="exact")
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class BenchmarkModel(Base):
    __tablename__ = "benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    benchmark_name = Column(String(100), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    total_tasks = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)
    remote_tokens = Column(Integer, default=0)
    local_tokens = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    savings = Column(Float, default=0.0)
    latency_avg = Column(Float, default=0.0)
    config_json = Column(Text, nullable=True)  # Store sweep configurations or settings as JSON

class CacheEventModel(Base):
    __tablename__ = "cache_events"

    id = Column(Integer, primary_key=True, index=True)
    hit_type = Column(String(50), nullable=False)  # EXACT, SEMANTIC, MISS
    similarity_score = Column(Float, default=0.0)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class RouterThresholdModel(Base):
    __tablename__ = "router_thresholds"

    id = Column(Integer, primary_key=True, index=True)
    intent_category = Column(String(50), unique=True, index=True, nullable=False)
    current_threshold = Column(Float, default=0.80)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

class RouterAdjustmentLogModel(Base):
    __tablename__ = "router_adjustment_logs"

    id = Column(Integer, primary_key=True, index=True)
    intent_category = Column(String(50), nullable=False, index=True)
    old_threshold = Column(Float, nullable=False)
    new_threshold = Column(Float, nullable=False)
    correction_rate = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class ProviderFailoverLogModel(Base):
    __tablename__ = "provider_failover_logs"

    id = Column(Integer, primary_key=True, index=True)
    failed_provider = Column(String(50), nullable=False)
    fallback_provider = Column(String(50), nullable=False)
    error_reason = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class SecurityEventModel(Base):
    __tablename__ = "security_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # prompt_injection, rate_limit_exceeded
    client_ip = Column(String(50), nullable=False)
    prompt_snippet = Column(Text, nullable=True)
    flagged_reasons = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
