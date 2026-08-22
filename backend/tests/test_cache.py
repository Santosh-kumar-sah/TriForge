import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database.models import Base
from app.cache.smart_cache import SmartCache

# In-memory database setup for FastAPI TestClient tests. StaticPool keeps one
# connection alive across the app thread so cache data is visible to endpoints.
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

def test_exact_cache_hit(db_session):
    cache = SmartCache()
    prompt = "What is the capital of France?"
    response = "The capital of France is Paris."
    model = "mock-model"
    
    # Verify cache is empty initially
    hit, hit_type, score = cache.get(db_session, prompt)
    assert hit is None
    assert hit_type == "MISS"

    # Set cache
    cache.set(
        db=db_session,
        prompt=prompt,
        response_text=response,
        model_name=model,
        prompt_tokens=10,
        completion_tokens=20,
        latency_ms=100.0
    )

    # Exact match check
    hit, hit_type, score = cache.get(db_session, prompt)
    assert hit is not None
    assert hit_type == "EXACT"
    assert score == 1.0
    assert hit.prompt == prompt
    assert hit.response_text == response

def test_semantic_cache_hit(db_session):
    cache = SmartCache(semantic_threshold=0.85)
    orig_prompt = "What is the capital of France?"
    sem_prompt = "what is the capital city of france"
    response = "The capital of France is Paris."
    
    cache.set(
        db=db_session,
        prompt=orig_prompt,
        response_text=response,
        model_name="mock-model",
        prompt_tokens=10,
        completion_tokens=20,
        latency_ms=100.0
    )

    # Semantic similarity match check
    hit, hit_type, score = cache.get(db_session, sem_prompt)
    assert hit is not None
    assert hit_type in ("EXACT", "SEMANTIC")
    assert score >= 0.85
    assert hit.response_text == response

def test_legitimate_response_about_errors_not_filtered(db_session):
    cache = SmartCache()
    prompt = "How does error handling work in Python?"
    response = "Errors in Python can be handled using try and except blocks."
    
    saved = cache.set(
        db=db_session,
        prompt=prompt,
        response_text=response,
        model_name="mock-model",
        prompt_tokens=10,
        completion_tokens=15,
        latency_ms=50.0
    )
    assert saved is not None
    
    hit, hit_type, score = cache.get(db_session, prompt)
    assert hit is not None
    assert hit_type == "EXACT"
    assert hit.response_text == response

def test_provider_error_is_filtered(db_session):
    cache = SmartCache()
    prompt = "Test prompt"
    error_response = "Error querying local model: Connection refused"
    
    saved = cache.set(
        db=db_session,
        prompt=prompt,
        response_text=error_response,
        model_name="mock-model",
        prompt_tokens=0,
        completion_tokens=0,
        latency_ms=10.0
    )
    assert saved is None

def test_stream_endpoint_cache_hit(db_session):
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from app.api.endpoints import router
    from app.database.session import get_db

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db_session

    cache = SmartCache()
    prompt = "Stream cache test question"
    response = "Stream cached response answer"
    cache.set(
        db=db_session,
        prompt=prompt,
        response_text=response,
        model_name="mock-model",
        prompt_tokens=5,
        completion_tokens=5,
        latency_ms=10.0
    )

    client = TestClient(app)
    res = client.post("/api/chat/stream", json={"prompt": prompt})
    assert res.status_code == 200
    assert "cache-hit" in res.text
    assert '"event": "content"' in res.text
    for word in response.split():
        assert word in res.text


