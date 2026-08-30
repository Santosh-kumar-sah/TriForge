from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import logging

from app.config import settings
from app.database.session import engine, Base, init_db_migrations
from app.api.endpoints import router as api_router

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TriForge")

# Create database tables and apply column migrations
init_db_migrations()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Production-Grade Hybrid Token-Efficient Routing Agent Backend"
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev/deployment convenience
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request duration logging middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"Path: {request.url.path} | Time: {process_time:.4f}s")
    return response

# Centralized Exception Handler
@app.exception_handler(Exception)
def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception caught on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "message": str(exc)},
    )

# Basic Health Check
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "time": time.time(),
        "database": "connected"
    }

# Include Api Routes
app.include_router(api_router)
