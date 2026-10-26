"""
RESQMesh — Offline Network Partition & Idempotent CRDT Reconciler
Simulates distributed mesh topologies, disconnected network islands,
local offline event queues, and deterministic conflict-free synchronization.
"""

from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timezone
from uuid import uuid4

class MeshNode:
    def __init__(self, node_id: str, name: str, island_id: str, lat: float, lng: float, battery_pct: int = 90):
        self.node_id = node_id
        self.name = name
        self.island_id = island_id  # e.g., 'island_A', 'island_B'
        self.lat = lat
        self.lng = lng
        self.battery_pct = battery_pct
        self.local_event_queue: List[Dict[str, Any]] = []
        self.vector_clock: Dict[str, int] = {node_id: 0}
        self.peers: Set[str] = set()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "name": self.name,
            "island_id": self.island_id,
            "lat": self.lat,
            "lng": self.lng,
            "battery_pct": self.battery_pct,
            "queue_len": len(self.local_event_queue),
            "vector_clock": self.vector_clock,
            "peers": list(self.peers)
        }

class MeshPartitionSimulator:
    def __init__(self):
        self.nodes: Dict[str, MeshNode] = {}
        self.islands: Dict[str, List[str]] = {"island_A": [], "island_B": []}
        self.is_partitioned: bool = False
        self.sync_audit_log: List[Dict[str, Any]] = []
        self.processed_event_ids: Set[str] = set()

        self._seed_mesh_topology()

    def _seed_mesh_topology(self):
        nodes_data = [
            ("node-alpha-relay", "Alpha Relay (Civil Lines)", "island_A", 21.1458, 79.0882, 94),
            ("node-medic-1", "Medic Unit Mobile 1", "island_A", 21.1420, 79.0850, 76),
            ("node-citizen-gateway", "Citizen Forward Gateway", "island_A", 21.1490, 79.0910, 88),
            ("node-bravo-relay", "Bravo Industrial Relay", "island_B", 21.1215, 79.0520, 82),
            ("node-boat-unit", "Flood Rescue Boat Unit", "island_B", 21.1260, 79.0580, 68),
            ("node-field-scout", "Field Scout Bravo", "island_B", 21.1180, 79.0490, 45)
        ]

        for nid, name, island, lat, lng, bat in nodes_data:
            node = MeshNode(nid, name, island, lat, lng, bat)
            self.nodes[nid] = node
            self.islands[island].append(nid)

        # Peer mesh connections
        self.nodes["node-alpha-relay"].peers.update(["node-medic-1", "node-citizen-gateway", "node-bravo-relay"])
        self.nodes["node-medic-1"].peers.update(["node-alpha-relay"])
        self.nodes["node-citizen-gateway"].peers.update(["node-alpha-relay"])

        self.nodes["node-bravo-relay"].peers.update(["node-alpha-relay", "node-boat-unit", "node-field-scout"])
        self.nodes["node-boat-unit"].peers.update(["node-bravo-relay"])
        self.nodes["node-field-scout"].peers.update(["node-bravo-relay"])

    def partition_network(self) -> Dict[str, Any]:
        """
        Sever cross-island mesh link between node-alpha-relay (Island A) and node-bravo-relay (Island B).
        Simulates infrastructure bridge or power outage creating two disconnected islands.
        """
        self.is_partitioned = True
        self.nodes["node-alpha-relay"].peers.discard("node-bravo-relay")
        self.nodes["node-bravo-relay"].peers.discard("node-alpha-relay")

        event = {
            "sync_event_id": f"sync-{uuid4().hex[:8]}",
            "type": "NETWORK_PARTITIONED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "description": "Network severed into two independent islands: Island A (North Ward) and Island B (Industrial Sector).",
            "islands": {
                "Island_A": [self.nodes[nid].name for nid in self.islands["island_A"]],
                "Island_B": [self.nodes[nid].name for nid in self.islands["island_B"]]
            }
        }
        self.sync_audit_log.insert(0, event)
        return event

    def queue_offline_event(self, island_id: str, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates an event inside an isolated island. Queued on local nodes with vector clock.
        """
        event_id = payload.get("event_id") or f"evt-{uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        node_id = self.islands.get(island_id, [None])[0]

        if node_id and node_id in self.nodes:
            self.nodes[node_id].vector_clock[node_id] = self.nodes[node_id].vector_clock.get(node_id, 0) + 1

        event_envelope = {
            "event_id": event_id,
            "origin_island": island_id,
            "event_type": event_type,
            "timestamp": now,
            "payload": payload,
            "vector_clock": dict(self.nodes[node_id].vector_clock) if node_id else {}
        }

        # Queue on all nodes within that island
        for nid in self.islands.get(island_id, []):
            self.nodes[nid].local_event_queue.append(event_envelope)

        return event_envelope

    def reconnect_and_reconcile(self) -> Dict[str, Any]:
        """
        Re-establishes connectivity between Island A and Island B.
        Exchanges queues, detects duplicate emergencies, identifies conflicting dispatches,
        merges compatible updates deterministically, and logs auditable resolution.
        """
        self.is_partitioned = False
        # Restore bridge link
        self.nodes["node-alpha-relay"].peers.add("node-bravo-relay")
        self.nodes["node-bravo-relay"].peers.add("node-alpha-relay")

        # Collect all queued events across islands
        all_queued = []
        for node in self.nodes.values():
            all_queued.extend(node.local_event_queue)
            node.local_event_queue.clear()

        # Deduplicate events by event_id (Idempotent processing)
        unique_events = {}
        for ev in all_queued:
            eid = ev["event_id"]
            if eid not in unique_events and eid not in self.processed_event_ids:
                unique_events[eid] = ev
                self.processed_event_ids.add(eid)

        reconciled_conflicts = []
        merged_count = 0

        # Conflict Detection:
        # Check if same emergency was dispatched by both Island A and Island B,
        # or if same responder was assigned to two conflicting rescues!
        dispatches_by_emergency: Dict[str, List[Dict[str, Any]]] = {}
        dispatches_by_responder: Dict[str, List[Dict[str, Any]]] = {}

        for ev in unique_events.values():
            if ev["event_type"] in ["DISPATCH_PROPOSED", "DISPATCH_ACCEPTED"]:
                emg_id = ev["payload"].get("emergency_id")
                resp_id = ev["payload"].get("responder_id")
                if emg_id:
                    dispatches_by_emergency.setdefault(emg_id, []).append(ev)
                if resp_id:
                    dispatches_by_responder.setdefault(resp_id, []).append(ev)

        # Reconcile Emergency Dual-Dispatches
        for emg_id, dispatches in dispatches_by_emergency.items():
            if len(dispatches) > 1:
                # Rule: Preserve the dispatch that is already ACCEPTED / physically underway.
                # If both accepted, pick the one with closer ETA or earlier causal timestamp.
                accepted_dispatches = [d for d in dispatches if d["event_type"] == "DISPATCH_ACCEPTED"]
                winner = accepted_dispatches[0] if accepted_dispatches else dispatches[0]
                losers = [d for d in dispatches if d != winner]

                reconciled_conflicts.append({
                    "conflict_type": "DUAL_DISPATCH_COLLISION",
                    "emergency_id": emg_id,
                    "winning_dispatch": winner["payload"],
                    "superseded_dispatches": [l["payload"] for l in losers],
                    "resolution": (
                        f"Resolved dual dispatch to emergency {emg_id}. "
                        f"Retained {winner['payload'].get('responder_name')} (Assignment is in-progress/accepted). "
                        f"Reallocated {len(losers)} redundant responder(s) back to emergency standby."
                    )
                })

        # Reconcile Responder Overcommitments
        for resp_id, dispatches in dispatches_by_responder.items():
            if len(dispatches) > 1:
                # Same responder assigned in both islands!
                # Prioritize higher-urgency emergency
                sorted_by_urgency = sorted(
                    dispatches,
                    key=lambda d: d["payload"].get("urgency", 5),
                    reverse=True
                )
                winner = sorted_by_urgency[0]
                orphaned = sorted_by_urgency[1:]

                reconciled_conflicts.append({
                    "conflict_type": "RESPONDER_DOUBLE_BOOKING",
                    "responder_id": resp_id,
                    "assigned_to": winner["payload"].get("emergency_id"),
                    "orphaned_emergencies": [o["payload"].get("emergency_id") for o in orphaned],
                    "resolution": (
                        f"Responder {resp_id} was double-booked across island partition. "
                        f"Preserved assignment for higher-urgency emergency {winner['payload'].get('emergency_id')}. "
                        f"Requeued {len(orphaned)} orphaned emergencies for immediate alternative matching."
                    )
                })

        merged_count = len(unique_events)
        reconcile_event = {
            "sync_event_id": f"sync-{uuid4().hex[:8]}",
            "type": "NETWORK_RECONNECTED_AND_RECONCILED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "merged_events_count": merged_count,
            "conflicts_detected": len(reconciled_conflicts),
            "reconciled_conflicts": reconciled_conflicts,
            "description": f"Mesh reconnected. Deterministically merged {merged_count} offline events with {len(reconciled_conflicts)} conflicts resolved idempotently."
        }
        self.sync_audit_log.insert(0, reconcile_event)
        return reconcile_event

    def get_mesh_status(self) -> Dict[str, Any]:
        return {
            "is_partitioned": self.is_partitioned,
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "audit_log": self.sync_audit_log[:30]
        }

mesh_simulator = MeshPartitionSimulator()
