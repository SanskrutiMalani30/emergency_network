"""
ScyllaDB Connection & Session Manager
Handles cluster connection, connection pooling, statement caching, and health diagnostics.
"""

import sys
import socket
try:
    import asyncore
except ImportError:
    try:
        import pyasyncore as asyncore
        sys.modules['asyncore'] = asyncore
    except ImportError:
        pass

import logging
from typing import Optional, Dict, Any

try:
    from cassandra.cluster import Cluster, Session, ExecutionProfile, EXEC_PROFILE_DEFAULT
    from cassandra.auth import PlainTextAuthProvider
    from cassandra.policies import (
        DCAwareRoundRobinPolicy,
        TokenAwarePolicy,
        RetryPolicy,
        ConstantReconnectionPolicy
    )
    from cassandra import ConsistencyLevel
    CASSANDRA_AVAILABLE = True
except Exception as err:
    CASSANDRA_AVAILABLE = False
    Cluster = None
    Session = None
    ExecutionProfile = None
    EXEC_PROFILE_DEFAULT = None
    ConsistencyLevel = None

from ..config import settings

logger = logging.getLogger("rakshak.db.session")

class ScyllaSessionManager:
    def __init__(self):
        self.cluster: Optional[Any] = None
        self.session: Optional[Any] = None
        self.is_connected: bool = False
        self.connection_error: Optional[str] = None
        self.prepared_statements: Dict[str, Any] = {}

    def _is_port_open(self, host: str, port: int, timeout: float = 0.4) -> bool:
        """Fast non-blocking socket probe to prevent driver hangs when ScyllaDB container is offline."""
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def connect(self) -> bool:
        """Initialize connection pool to ScyllaDB nodes."""
        if not CASSANDRA_AVAILABLE:
            self.is_connected = False
            self.connection_error = "Cassandra driver connection class not loaded"
            logger.info("Cassandra driver unavailable; operating in memory-mirror mode.")
            return False

        host = settings.SCYLLA_HOSTS[0] if settings.SCYLLA_HOSTS else "127.0.0.1"
        port = settings.SCYLLA_PORT

        # Fast socket probe: do not block test execution if ScyllaDB isn't up
        if not self._is_port_open(host, port):
            self.is_connected = False
            self.connection_error = f"ScyllaDB node at {host}:{port} is currently unreachable. Start ScyllaDB via docker-compose."
            logger.info(f"ScyllaDB node {host}:{port} unreachable. Running in high-throughput local mode.")
            return False

        try:
            logger.info(f"Connecting to ScyllaDB at {settings.SCYLLA_HOSTS}:{settings.SCYLLA_PORT}...")
            
            auth_provider = None
            if settings.SCYLLA_USER and settings.SCYLLA_PASSWORD:
                auth_provider = PlainTextAuthProvider(
                    username=settings.SCYLLA_USER,
                    password=settings.SCYLLA_PASSWORD
                )

            profile_fast_read = ExecutionProfile(
                load_balancing_policy=TokenAwarePolicy(DCAwareRoundRobinPolicy(local_dc=settings.SCYLLA_LOCAL_DC)),
                retry_policy=RetryPolicy(),
                consistency_level=ConsistencyLevel.LOCAL_ONE,
                request_timeout=settings.SCYLLA_TIMEOUT_SECONDS
            )

            profile_critical_write = ExecutionProfile(
                load_balancing_policy=TokenAwarePolicy(DCAwareRoundRobinPolicy(local_dc=settings.SCYLLA_LOCAL_DC)),
                retry_policy=RetryPolicy(),
                consistency_level=ConsistencyLevel.LOCAL_QUORUM,
                request_timeout=settings.SCYLLA_TIMEOUT_SECONDS
            )

            execution_profiles = {
                EXEC_PROFILE_DEFAULT: profile_fast_read,
                "critical_write": profile_critical_write,
                "fast_read": profile_fast_read
            }

            self.cluster = Cluster(
                contact_points=settings.SCYLLA_HOSTS,
                port=settings.SCYLLA_PORT,
                auth_provider=auth_provider,
                execution_profiles=execution_profiles,
                reconnection_policy=ConstantReconnectionPolicy(delay=1.0, max_attempts=2),
                connect_timeout=2.0
            )

            self.session = self.cluster.connect()
            self._ensure_keyspace_and_tables()
            self.session.set_keyspace(settings.SCYLLA_KEYSPACE)
            self._prepare_statements()

            self.is_connected = True
            self.connection_error = None
            logger.info("Successfully connected to ScyllaDB cluster.")
            return True

        except Exception as e:
            self.is_connected = False
            self.connection_error = str(e)
            logger.info(f"ScyllaDB cluster connect failed: {e}. Running in local mode.")
            return False

    def _ensure_keyspace_and_tables(self):
        if not self.session:
            return
        cql_keyspace = f"""
        CREATE KEYSPACE IF NOT EXISTS {settings.SCYLLA_KEYSPACE}
        WITH replication = {{
            'class': 'SimpleStrategy',
            'replication_factor': 1
        }};
        """
        self.session.execute(cql_keyspace)

    def _prepare_statements(self):
        if not self.session:
            return

        cql_queries = {
            "insert_incident": """
                INSERT INTO incidents (
                    incident_id, category, severity, urgency, status, description,
                    lat, lng, reporter_phone, people_affected, food_needed, water_needed,
                    shelter_needed, medical_needed, image_url, ai_assessment, ai_reason,
                    ai_confidence, idempotency_key, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            "insert_incident_by_status": """
                INSERT INTO incidents_by_status (
                    status, created_at, incident_id, category, severity, urgency,
                    description, lat, lng, people_affected
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            "get_incident_by_id": "SELECT * FROM incidents WHERE incident_id = ?",
            "get_incidents_by_status": "SELECT * FROM incidents_by_status WHERE status = ? LIMIT 100",
            "insert_incident_event": """
                INSERT INTO incident_events (
                    incident_id, event_time, event_id, event_type, title, details, actor
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            "get_incident_events": "SELECT * FROM incident_events WHERE incident_id = ? LIMIT 50",
            "insert_depot": """
                INSERT INTO depots (
                    depot_id, name, sector, lat, lng, food_units, water_units,
                    shelter_units, medical_units, total_vehicles, active, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            "get_all_depots": "SELECT * FROM depots",
            "get_depot_by_id": "SELECT * FROM depots WHERE depot_id = ?",
            "insert_delivery": """
                INSERT INTO supply_deliveries (
                    delivery_id, incident_id, depot_id, vehicle_id, vehicle_number,
                    status, food_units, water_units, shelter_units, medical_units,
                    eta_minutes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        }

        for name, query in cql_queries.items():
            try:
                self.prepared_statements[name] = self.session.prepare(query)
            except Exception as e:
                logger.error(f"Failed to prepare statement '{name}': {e}")

    def close(self):
        if self.cluster:
            self.cluster.shutdown()
            self.is_connected = False

db_manager = ScyllaSessionManager()
