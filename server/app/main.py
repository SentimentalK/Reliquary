"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.devices import router as devices_router
from app.api.logs import router as logs_router
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    # Startup
    from app.services.auth import init_db
    init_db()
    print("[Reliquary] Server started (Multi-User Mode)")
    
    yield
    
    # Shutdown
    print("[Reliquary] Server shutting down")


app = FastAPI(
    title="Reliquary API",
    description="Multi-User Voice Transcription Service with Zero-Trust Architecture",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for web UI and cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router, tags=["authentication"])
app.include_router(chat_router, tags=["transcription"])
app.include_router(devices_router, tags=["devices"])
app.include_router(logs_router, tags=["logs"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
        ws_ping_interval=None,  # Disable ping - client may not respond during streaming
        ws_ping_timeout=None,   # No timeout
        timeout_keep_alive=300,  # Keep connections alive for 5 minutes
    )
