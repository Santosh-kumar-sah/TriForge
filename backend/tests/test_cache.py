import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database.models import Base
from app.cache.smart_cache import SmartCache

# In-memory database setup for testing
engine = create_engine("sqlite:///:memory:")
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
