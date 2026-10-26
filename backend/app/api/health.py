from fastapi import APIRouter
import time
from typing import Dict, Any
from ..db.session import db_manager
from ..config import settings

router = APIRouter(tags=["Health & Diagnostics"])

@router.get("/health")
def health_check() -> Dict[str, Any]:
    """
    Health check endpoint reporting application and ScyllaDB connectivity status.
    """
    scylla_latency_ms = None
    if db_manager.is_connected and db_manager.session:
        try:
            start_t = time.perf_counter()
            db_manager.session.execute("SELECT now() FROM system.local;")
            scylla_latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
        except Exception:
            scylla_latency_ms = None

    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": {
            "type": "ScyllaDB",
            "connected": db_manager.is_connected,
            "hosts": settings.SCYLLA_HOSTS,
            "port": settings.SCYLLA_PORT,
            "keyspace": settings.SCYLLA_KEYSPACE,
            "latency_ms": scylla_latency_ms,
            "error": db_manager.connection_error,
            "mode": "ScyllaDB-Native-Cluster" if db_manager.is_connected else "High-Throughput-Memory-Mirror"
        },
        "ai_engine": {
            "status": "operational",
            "model": "Rakshak-Triage-v2.4-HeuristicNLP",
            "mode": "Local-Explainable-Triage"
        }
    }
