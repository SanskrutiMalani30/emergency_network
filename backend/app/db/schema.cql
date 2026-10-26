-- ScyllaDB Low-Latency Crisis Response Schema for Rakshak AI
-- Keyspace Definition with NetworkTopologyStrategy or SimpleStrategy for local dev

CREATE KEYSPACE IF NOT EXISTS rakshak_tactical
WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1
};

USE rakshak_tactical;

-- 1. Primary Incidents Table (Lookup by ID)
-- Optimized for point-reads by incident_id
CREATE TABLE IF NOT EXISTS incidents (
    incident_id uuid,
    category text,
    severity text,
    urgency int,
    status text,
    description text,
    lat double,
    lng double,
    reporter_phone text,
    people_affected int,
    food_needed int,
    water_needed int,
    shelter_needed int,
    medical_needed int,
    image_url text,
    ai_assessment text,
    ai_reason text,
    ai_confidence double,
    idempotency_key text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY ((incident_id))
);

-- 2. Incidents By Status Table (Tactical Dispatch Feed)
-- Partitioned by status to query active vs resolved incidents without full table scans
-- Clustered by created_at DESC for chronological retrieval
CREATE TABLE IF NOT EXISTS incidents_by_status (
    status text,
    created_at timestamp,
    incident_id uuid,
    category text,
    severity text,
    urgency int,
    description text,
    lat double,
    lng double,
    people_affected int,
    PRIMARY KEY ((status), created_at, incident_id)
) WITH CLUSTERING ORDER BY (created_at DESC, incident_id ASC);

-- 3. Time-Series Incident Events & Audit Trail
-- Partitioned by incident_id with reverse chronological clustering
CREATE TABLE IF NOT EXISTS incident_events (
    incident_id uuid,
    event_id uuid,
    event_type text,
    title text,
    details text,
    actor text,
    event_time timestamp,
    PRIMARY KEY ((incident_id), event_time, event_id)
) WITH CLUSTERING ORDER BY (event_time DESC, event_id ASC);

-- 4. Global Tactical Telemetry Stream (Recent 24-Hour Event Shard)
-- Partitioned by date bucket (e.g. '2026-10-25') to prevent oversized single partitions
CREATE TABLE IF NOT EXISTS global_event_stream (
    day_bucket text,
    event_time timestamp,
    event_id uuid,
    incident_id uuid,
    event_type text,
    title text,
    actor text,
    PRIMARY KEY ((day_bucket), event_time, event_id)
) WITH CLUSTERING ORDER BY (event_time DESC, event_id ASC);

-- 5. Relief Supply Depots
CREATE TABLE IF NOT EXISTS depots (
    depot_id uuid,
    name text,
    sector text,
    lat double,
    lng double,
    food_units int,
    water_units int,
    shelter_units int,
    medical_units int,
    total_vehicles int,
    active boolean,
    updated_at timestamp,
    PRIMARY KEY ((depot_id))
);

-- 6. Delivery Vehicles & Dispatches
CREATE TABLE IF NOT EXISTS delivery_vehicles (
    vehicle_id uuid,
    vehicle_number text,
    depot_id uuid,
    vehicle_type text,
    status text,
    current_lat double,
    current_lng double,
    assigned_incident_id uuid,
    updated_at timestamp,
    PRIMARY KEY ((vehicle_id))
);

-- 7. Deliveries Record
CREATE TABLE IF NOT EXISTS supply_deliveries (
    delivery_id uuid,
    incident_id uuid,
    depot_id uuid,
    vehicle_id uuid,
    vehicle_number text,
    status text,
    food_units int,
    water_units int,
    shelter_units int,
    medical_units int,
    eta_minutes int,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY ((delivery_id))
);

-- Index for searching deliveries by incident_id
CREATE INDEX IF NOT EXISTS deliveries_by_incident ON supply_deliveries (incident_id);

-- 8. Emergency SOS Signals
CREATE TABLE IF NOT EXISTS sos_signals (
    sos_id uuid,
    lat double,
    lng double,
    phone text,
    message text,
    urgency text,
    battery_level int,
    created_at timestamp,
    PRIMARY KEY ((sos_id))
);
