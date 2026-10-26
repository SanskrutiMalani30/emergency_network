"""
ScyllaDB Schema Migration & Database Initializer
Applies schema.cql against the ScyllaDB cluster and seeds baseline operational data.
"""

import sys
import os
import time

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.config import settings
from backend.app.db.session import db_manager, CASSANDRA_AVAILABLE

def run_migration():
    print("=" * 60)
    print(" Rakshak AI — ScyllaDB Schema Migration & Initializer")
    print("=" * 60)

    if not CASSANDRA_AVAILABLE:
        print("[ERROR] Cassandra driver is not loaded. Cannot run ScyllaDB migration.")
        sys.exit(1)

    cql_file_path = os.path.join(os.path.dirname(__file__), "..", "backend", "app", "db", "schema.cql")
    if not os.path.exists(cql_file_path):
        print(f"[ERROR] CQL file not found at: {cql_file_path}")
        sys.exit(1)

    print(f"Reading schema from: {cql_file_path}")
    with open(cql_file_path, "r", encoding="utf-8") as f:
        cql_content = f.read()

    print(f"Connecting to ScyllaDB at {settings.SCYLLA_HOSTS}:{settings.SCYLLA_PORT}...")
    success = db_manager.connect()
    if not success or not db_manager.session:
        print(f"[ERROR] Failed to connect to ScyllaDB cluster: {db_manager.connection_error}")
        print("Please ensure ScyllaDB container is running: docker-compose up -d")
        sys.exit(1)

    print("Connected! Executing CQL statements...")
    statements = [stmt.strip() for stmt in cql_content.split(";") if stmt.strip()]

    for idx, stmt in enumerate(statements, start=1):
        try:
            print(f"  [{idx}/{len(statements)}] Executing: {stmt.splitlines()[0][:50]}...")
            db_manager.session.execute(stmt)
        except Exception as e:
            print(f"  [WARN] Statement warning/error: {e}")

    print("=" * 60)
    print("[SUCCESS] ScyllaDB schema initialized successfully!")
    print("=" * 60)

if __name__ == "__main__":
    run_migration()
