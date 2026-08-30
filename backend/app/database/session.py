import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.event import listens_for
from app.config import settings

# If sqlite with a relative path, resolve canonically relative to project root
raw_url = settings.DATABASE_URL
if raw_url.startswith("sqlite:///./") or (raw_url.startswith("sqlite:///") and not raw_url.startswith("sqlite:////") and ":memory:" not in raw_url):
    rel_path = raw_url.replace("sqlite:///./", "").replace("sqlite:///", "")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    abs_db_path = os.path.abspath(os.path.join(project_root, rel_path))
    norm_path = abs_db_path.replace("\\", "/")
    db_url = f"sqlite:///{norm_path}"
else:
    db_url = raw_url

is_sqlite = db_url.startswith("sqlite")

# SQLite needs check_same_thread=False for FastAPI multi-threading
# PostgreSQL (Neon) needs pool_pre_ping=True for serverless connection handling
if is_sqlite:
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        db_url,
        pool_pre_ping=True,       # Reconnect if connection dropped (serverless)
        pool_size=5,
        max_overflow=10,
    )

@listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if is_sqlite:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB Cache
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def init_db_migrations():
    """
    Ensure newly added columns (user_id, user_email, etc.) exist in existing database tables.
    """
    with engine.begin() as conn:
        Base.metadata.create_all(bind=conn)
        if is_sqlite:
            # Check requests table columns
            try:
                result = conn.execute(text("PRAGMA table_info(requests)"))
                cols = [row[1] for row in result.fetchall()]
                if "user_id" not in cols:
                    conn.execute(text("ALTER TABLE requests ADD COLUMN user_id VARCHAR(100)"))
                if "user_email" not in cols:
                    conn.execute(text("ALTER TABLE requests ADD COLUMN user_email VARCHAR(150)"))
            except Exception:
                pass

            # Check benchmarks table columns
            try:
                result = conn.execute(text("PRAGMA table_info(benchmarks)"))
                b_cols = [row[1] for row in result.fetchall()]
                if "user_id" not in b_cols:
                    conn.execute(text("ALTER TABLE benchmarks ADD COLUMN user_id VARCHAR(100)"))
                if "user_email" not in b_cols:
                    conn.execute(text("ALTER TABLE benchmarks ADD COLUMN user_email VARCHAR(150)"))
            except Exception:
                pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

