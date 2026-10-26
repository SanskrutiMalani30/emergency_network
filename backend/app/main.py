"""
RESQMesh | CASCADE '26 — The Human-Powered Emergency Network
Main FastAPI Application Entrypoint
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
import logging

from .config import settings
from .db.session import db_manager
from .api import incidents, relief, ai, events, health, simulation, resqmesh, auth

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("resqmesh.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RESQMesh Tactical Emergency Backend...")
    db_manager.connect()
    yield
    logger.info("Shutting down RESQMesh Tactical Emergency Backend...")
    db_manager.close()

app = FastAPI(
    title="RESQMesh | CASCADE '26 — The Human-Powered Emergency Network",
    version="2.4.0",
    description="Decentralized, trust-aware emergency coordination system built for CASCADE '26.",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router, prefix="/api")
app.include_router(resqmesh.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(relief.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(simulation.router, prefix="/api")

from .schemas.incident import SOSCreate

@app.post("/api/sos", status_code=201, tags=["Emergency SOS"])
def deploy_direct_sos(payload: SOSCreate):
    """Direct root SOS endpoint supporting Section 8 requirement."""
    return repository.record_sos(payload)

# Serve built frontend assets
frontend_dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
assets_path = os.path.join(frontend_dist_path, "assets")

if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

@app.get("/sw.js")
def serve_sw():
    sw_file = os.path.join(frontend_dist_path, "sw.js")
    if os.path.exists(sw_file):
        return FileResponse(sw_file, media_type="application/javascript")
    return FileResponse(os.path.join(frontend_dist_path, "index.html"))

@app.get("/manifest.json")
def serve_manifest():
    manifest_file = os.path.join(frontend_dist_path, "manifest.json")
    if os.path.exists(manifest_file):
        return FileResponse(manifest_file, media_type="application/manifest+json")
    return {}

@app.get("/")
@app.get("/index.html")
def serve_index():
    index_file = os.path.join(frontend_dist_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {
        "service": "RESQMesh | CASCADE '26 — Human-Powered Emergency Network",
        "version": "2.4.0",
        "docs_url": "/docs",
        "health_url": "/api/health"
    }
