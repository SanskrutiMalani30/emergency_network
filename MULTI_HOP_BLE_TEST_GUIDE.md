# RESQMesh — Physical Device Testing Guide
## Offline Multi-Hop SOS over Bluetooth Low Energy (BLE)

This guide provides step-by-step instructions for testing the decentralized **Human-Powered Emergency Network** using 2, 3, or 4 physical Android smartphones or laptops in real-world disaster simulation conditions without internet or cellular connectivity.

---

## 1. Network Topology & Relay Architecture

```
[Phone A: Originator]
  • Airplane Mode: ON
  • Wi-Fi: OFF
  • Cellular: OFF
  • Bluetooth: ON
       │
       ▼ (BLE Advertisement / GATT write, Hop 0 -> 1)
[Phone B: Relay Hop 1]
  • Airplane Mode: ON
  • Wi-Fi: OFF
  • Cellular: OFF
  • Bluetooth: ON
       │
       ▼ (BLE Advertisement / GATT write, Hop 1 -> 2)
[Phone C: Relay Hop 2]
  • Airplane Mode: ON
  • Wi-Fi: OFF
  • Cellular: OFF
  • Bluetooth: ON
       │
       ▼ (BLE Advertisement / GATT write, Hop 2 -> 3)
[Phone D: Internet Gateway]
  • Cellular / Wi-Fi: ON
  • Bluetooth: ON
       │
       ▼ (HTTPS POST /api/resqmesh/multi-hop/sync)
[Central Command Server]
  • Verification Engine (intake_engine)
  • Trust Engine (freshness & Sybil defense)
  • Issues Signed Cryptographic ACK
       │
       ▼ (Reverse BLE Propagation of ACK: D -> C -> B -> A)
[Phone A: Originator Confirmed]
  • Status: "SERVER_ACKNOWLEDGED"
  • Displays Official Server Timestamp & Signature
```

---

## 2. Prerequisites & Installation

### Option A: Real Android Handsets (via Native Android BLE Bridge)
1. Ensure handsets run Android 8.0+ (API 26 to 34).
2. Build and install the APK from the `/android` directory:
   ```bash
   cd android
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
3. Grant runtime permissions when prompted:
   - **Nearby Devices / Bluetooth** (`BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`)
   - **Location** (`ACCESS_FINE_LOCATION`)
   - **Notifications** (`POST_NOTIFICATIONS`)

### Option B: Cross-Tab / Laptop Demonstration
1. Open Chrome or Edge on two or more browser windows or separate laptops on the local network (`http://localhost:8000` or `http://<LAN_IP>:8000`).
2. The system automatically initializes the **Tactical RF Mesh Simulator** over `BroadcastChannel` with real 24-byte compact binary codecs, hop budgeting, and SHA-256 payload integrity hashing.

---

## 3. Test Scenarios

### Scenario 1: 2-Device Direct Peer Relay (Originator + Gateway)

1. **Setup**:
   - **Phone A (Citizen)**: Enable Airplane Mode, turn Wi-Fi OFF, turn Bluetooth ON.
   - **Phone D (Gateway)**: Keep mobile data or Wi-Fi ON, turn Bluetooth ON. Place devices ~10 meters apart.
2. **Execution**:
   - On **Phone A**, log in (e.g. as Priya Sharma) and open the **Operations & Map** screen.
   - In the **Emergency Description** card, enter:
     > *"Trapped on roof near Market Road, water rising rapidly. Need rescue boat."*
   - Tap **"SUBMIT EMERGENCY SOS"**.
   - Observe **Phone A**:
     - Local delivery status displays: `SAVED_LOCALLY` -> `QUEUED_FOR_RELAY`.
     - The Multi-Hop Status Panel displays the packet with `0 / 7 Hops`.
3. **Verification**:
   - Within 2-4 seconds, **Phone D** detects Phone A's BLE advertisement.
   - **Phone D** automatically ingests the packet, switches status to `RECEIVED_BY_GATEWAY`, and flushes it to the backend (`POST /api/resqmesh/multi-hop/sync`).
   - The Central Server validates the report, checks trust freshness, and responds with a signed ACK.
   - **Phone D** transmits the ACK back over BLE.
   - **Phone A** receives the ACK: status updates to **`SERVER_ACKNOWLEDGED`** (emerald badge) with the official server signature token.

---

### Scenario 2: 3-Device Multi-Hop Forwarding Chain (A -> B -> D)

1. **Setup**:
   - Arrange devices linearly down a corridor:
     - **Room 101**: Phone A (Air-gapped)
     - **Hallway (Middle)**: Phone B (Air-gapped Relay)
     - **Room 105 (Window with 4G / Wi-Fi)**: Phone D (Gateway)
   - Ensure Phone A is out of direct RF range of Phone D (Phone A can only see Phone B).
2. **Execution**:
   - **Phone A** submits an SOS report.
   - **Phone B** picks up the beacon:
     - Inspects hop limit (`hops_taken = 0 < 7`).
     - Appends `Phone B` to `relay_path`.
     - Increments `hops_taken = 1`.
     - Re-broadcasts the packet over BLE.
   - **Phone D** receives the forwarded beacon from Phone B (`hops_taken = 1`, `relay_path: ["Phone A", "Phone B"]`).
   - **Phone D** uploads the multi-hop packet to the server gateway.
3. **Verification**:
   - Inspect the **Multi-Hop Status Panel** on all three devices:
     - **Relay Chain**: `[Phone A (Origin)] -> [Phone B (Hop 1)] -> [Phone D (Gateway)] -> [HQ Server]`.
     - **Hop Budget**: `1 / 7 Hops` -> `2 / 7 Hops`.
     - Delivery state on Phone A transitions to `SERVER_ACKNOWLEDGED`.

---

### Scenario 3: Loop Prevention & Duplicate Suppression

1. **Loop Prevention Verification**:
   - If Phone B transmits a packet, and Phone A picks up Phone B's broadcast containing Phone A's node ID in `relay_path`, Phone A immediately drops the packet (`LOOP_PREVENTED`).
   - Check browser developer console: `handleIncomingPacket: LOOP_PREVENTED`.
2. **Deduplication Across Multiple Gateways**:
   - If Phone A's broadcast reaches both Gateway D1 and Gateway D2, both gateways upload the same `message_id` to `POST /api/resqmesh/multi-hop/sync`.
   - The backend checks `msg.message_id` in `repository._multi_hop_messages`.
   - Second upload is flagged as `"deduplicated"`.
   - **Crucial Invariant**: The single original emergency is NOT duplicated, and independent witness corroboration count is NOT artificially inflated.

---

### Scenario 4: TTL Expiry & Hop Budget Exhaustion

1. **Hop Budget Exhaustion**:
   - A packet with `hop_limit = 2` that traverses 2 hops without reaching a gateway is marked as `DELIVERY_FAILED` and dropped from active RF forwarding, preventing broadcast storms.
2. **TTL Expiry**:
   - Stale packets older than `expires_at` are marked as `EXPIRED` and ignored by forwarders.

---

## 4. Battery Optimization Schedule

The BLE mesh engine utilizes an adaptive transmission schedule to conserve device battery:
- **Immediate Burst**: 3 repeated advertisements over the first 4 seconds (delays: 0s, 2s, 4s).
- **Secondary Propagation**: Intervals increase to 10s and 30s.
- **Sleep / Idle Listening**: BLE scanning runs in `SCAN_MODE_BALANCED` (duty cycle: ~25%), minimizing battery drain to <3% per hour in background standby.
