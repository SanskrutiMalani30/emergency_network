"""
Rakshak AI — Latency & Load Testing Benchmark
Measures p50, p95, and p99 read/write latencies across crisis operations.
"""

import sys
import os
import time
import statistics
from uuid import uuid4

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.db.repository import repository
from backend.app.schemas.incident import IncidentCreate
from backend.app.services.ai_triage import ai_engine
from backend.app.schemas.ai import AIAssessmentRequest

def calculate_percentiles(latencies):
    if not latencies:
        return 0, 0, 0
    latencies.sort()
    n = len(latencies)
    p50 = latencies[int(n * 0.50)]
    p95 = latencies[int(n * 0.95)]
    p99 = latencies[min(int(n * 0.99), n - 1)]
    return p50, p95, p99

def run_benchmark(iterations: int = 200):
    print("=" * 65)
    print(f" Rakshak AI Tactical Benchmark ({iterations} iterations)")
    print("=" * 65)

    write_latencies = []
    read_latencies = []
    ai_latencies = []
    created_ids = []

    # 1. Measure Incident Creation Write Latency (Low-Latency Prepared Storage)
    print(f"[*] Benchmarking Incident Insertions (n={iterations})...")
    for i in range(iterations):
        payload = IncidentCreate(
            category="flood" if i % 2 == 0 else "medical",
            description=f"Automated benchmark distress signal telemetry batch-{i}",
            lat=21.1400 + (i * 0.0001),
            lng=79.0800 + (i * 0.0001),
            people_affected=4,
            idempotency_key=f"bench_{uuid4()}"
        )
        t0 = time.perf_counter()
        inc = repository.create_incident(payload)
        t1 = time.perf_counter()
        write_latencies.append((t1 - t0) * 1000)  # ms
        created_ids.append(inc.incident_id)

    # 2. Measure Point-Lookup Read Latency
    print(f"[*] Benchmarking Point-Lookup Point Reads (n={iterations})...")
    for inc_id in created_ids:
        t0 = time.perf_counter()
        _ = repository.get_incident(inc_id)
        t1 = time.perf_counter()
        read_latencies.append((t1 - t0) * 1000)  # ms

    # 3. Measure Explainable AI Triage Evaluation Latency
    print(f"[*] Benchmarking AI Triage Evaluations (n={iterations})...")
    for i in range(iterations):
        req = AIAssessmentRequest(
            description="Massive building wall collapse with severe trapped casualties needing emergency paramedics",
            people_affected=12,
            has_image=True
        )
        t0 = time.perf_counter()
        _ = ai_engine.assess_incident(req)
        t1 = time.perf_counter()
        ai_latencies.append((t1 - t0) * 1000)  # ms

    # Results
    w_p50, w_p95, w_p99 = calculate_percentiles(write_latencies)
    r_p50, r_p95, r_p99 = calculate_percentiles(read_latencies)
    ai_p50, ai_p95, ai_p99 = calculate_percentiles(ai_latencies)

    print("\n" + "=" * 65)
    print(" BENCHMARK RESULTS (Time in Milliseconds)")
    print("=" * 65)
    print(f"{'Operation':<30} | {'p50 (ms)':<9} | {'p95 (ms)':<9} | {'p99 (ms)':<9}")
    print("-" * 65)
    print(f"{'Incident Write (Data Layer)':<30} | {w_p50:<9.3f} | {w_p95:<9.3f} | {w_p99:<9.3f}")
    print(f"{'Incident Read (Point Lookup)':<30} | {r_p50:<9.3f} | {r_p95:<9.3f} | {r_p99:<9.3f}")
    print(f"{'AI Triage NLP Assessment':<30} | {ai_p50:<9.3f} | {ai_p95:<9.3f} | {ai_p99:<9.3f}")
    print("=" * 65)

if __name__ == "__main__":
    run_benchmark(200)
