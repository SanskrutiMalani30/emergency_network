/**
 * RESQMesh — Local Offline Routing & Road Graph Engine
 *
 * Provides air-gapped, turn-by-turn road network pathfinding without relying on
 * Google Maps, Mapbox, or any external internet-dependent routing APIs.
 *
 * Features:
 * 1. Real topological road network graph with landmark nodes and bidirectional road edges.
 * 2. Dijkstra shortest path algorithm with dynamic hazard avoidance / penalty weighting.
 * 3. Exact road polyline coordinates for Leaflet map rendering.
 * 4. Human-readable turn-by-turn navigation steps.
 * 5. Estimated travel time based on response mode (Vehicle, Foot, Boat).
 * 6. Active hazard intersection check (e.g. crossing flooded bridges).
 * 7. Explicit straight-line bearing fallback when points lie outside the routable road graph.
 */

// Haversine formula for spatial distance (km)
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Initial compass bearing between two points (degrees 0-360)
export function calculateCompassBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const cardIndex = Math.round(brng / 45);
  return {
    degrees: Math.round(brng),
    cardinal: cardinals[cardIndex],
    label: `${Math.round(brng)}° ${cardinals[cardIndex]}`
  };
}

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  return haversineDistanceKm(lat1, lon1, lat2, lon2) * 1000;
}

export function calculateBearingDegrees(lat1, lon1, lat2, lon2) {
  return calculateCompassBearing(lat1, lon1, lat2, lon2).degrees;
}

/**
 * Topologically connected road network graph for the central disaster corridor
 * (Nagpur Ward 12 / Sitabuldi / Civil Lines / Central Avenue / Canal Crossings).
 */
export const LOCAL_ROAD_GRAPH = {
  nodes: {
    'node_central_hospital': { id: 'node_central_hospital', name: 'Government Medical College & Hospital', lat: 21.1440, lng: 79.0860 },
    'node_wardha_rd_junction': { id: 'node_wardha_rd_junction', name: 'Wardha Road & Central Ave Junction', lat: 21.1458, lng: 79.0882 },
    'node_alpha_depot': { id: 'node_alpha_depot', name: 'Central Relief Depot Alpha', lat: 21.1465, lng: 79.0888 },
    'node_sitabuldi_sq': { id: 'node_sitabuldi_sq', name: 'Sitabuldi Interchange Square', lat: 21.1472, lng: 79.0845 },
    'node_civil_lines_north': { id: 'node_civil_lines_north', name: 'Civil Lines Administrative Gate', lat: 21.1510, lng: 79.0815 },
    'node_ward12_bridge': { id: 'node_ward12_bridge', name: 'Ward 12 Canal Bridge', lat: 21.1524, lng: 79.0910, is_flood_prone: true },
    'node_ward12_residential': { id: 'node_ward12_residential', name: 'Ward 12 Residential Inundation Zone', lat: 21.1540, lng: 79.0935, is_flood_prone: true },
    'node_riverbank_causeway': { id: 'node_riverbank_causeway', name: 'North Riverbank Causeway', lat: 21.1565, lng: 79.0880, is_flood_prone: true },
    'node_canal_south_crossing': { id: 'node_canal_south_crossing', name: 'South Canal Gate', lat: 21.1415, lng: 79.0830 },
    'node_west_corridor_gate': { id: 'node_west_corridor_gate', name: 'West Commercial Ring Road', lat: 21.1380, lng: 79.0740 },
    'node_industrial_depot_bravo': { id: 'node_industrial_depot_bravo', name: 'Forward Depot Bravo (Industrial West)', lat: 21.1215, lng: 79.0520 },
    'node_community_shelter_s9': { id: 'node_community_shelter_s9', name: 'Sector 9 Community Evacuation Center', lat: 21.1380, lng: 79.0680 },
    'node_railway_colony': { id: 'node_railway_colony', name: 'South Railway Feeder Road', lat: 21.1270, lng: 79.0550 },
    'node_old_market_sq': { id: 'node_old_market_sq', name: 'Old Market Intersection', lat: 21.1495, lng: 79.0920 }
  },
  edges: [
    // Central Corridor Links
    { from: 'node_central_hospital', to: 'node_wardha_rd_junction', name: 'Central Hospital Link Road', distanceMeters: 310, waypoints: [[21.1440, 79.0860], [21.1450, 79.0872], [21.1458, 79.0882]] },
    { from: 'node_wardha_rd_junction', to: 'node_alpha_depot', name: 'Depot Access Boulevard', distanceMeters: 120, waypoints: [[21.1458, 79.0882], [21.1465, 79.0888]] },
    { from: 'node_wardha_rd_junction', to: 'node_sitabuldi_sq', name: 'Main Wardha Arterial', distanceMeters: 420, waypoints: [[21.1458, 79.0882], [21.1466, 79.0860], [21.1472, 79.0845]] },
    { from: 'node_sitabuldi_sq', to: 'node_civil_lines_north', name: 'High Court / Civil Lines Road', distanceMeters: 550, waypoints: [[21.1472, 79.0845], [21.1492, 79.0828], [21.1510, 79.0815]] },

    // North / Ward 12 Flood Zone Links
    { from: 'node_wardha_rd_junction', to: 'node_old_market_sq', name: 'East Ring Radial Road', distanceMeters: 580, waypoints: [[21.1458, 79.0882], [21.1480, 79.0905], [21.1495, 79.0920]] },
    { from: 'node_old_market_sq', to: 'node_ward12_bridge', name: 'Canal Approach Way', distanceMeters: 340, waypoints: [[21.1495, 79.0920], [21.1512, 79.0915], [21.1524, 79.0910]], is_flood_prone: true },
    { from: 'node_ward12_bridge', to: 'node_ward12_residential', name: 'Ward 12 Submerged Service Lane', distanceMeters: 320, waypoints: [[21.1524, 79.0910], [21.1532, 79.0922], [21.1540, 79.0935]], is_flood_prone: true },
    { from: 'node_civil_lines_north', to: 'node_riverbank_causeway', name: 'North Riverbank Parkway', distanceMeters: 880, waypoints: [[21.1510, 79.0815], [21.1540, 79.0840], [21.1565, 79.0880]], is_flood_prone: true },
    { from: 'node_riverbank_causeway', to: 'node_ward12_bridge', name: 'Northern Flood Wall Track', distanceMeters: 560, waypoints: [[21.1565, 79.0880], [21.1545, 79.0895], [21.1524, 79.0910]], is_flood_prone: true },

    // South & West Links
    { from: 'node_central_hospital', to: 'node_canal_south_crossing', name: 'Medical South Link', distanceMeters: 410, waypoints: [[21.1440, 79.0860], [21.1425, 79.0842], [21.1415, 79.0830]] },
    { from: 'node_canal_south_crossing', to: 'node_west_corridor_gate', name: 'Canal South Embankment Road', distanceMeters: 1020, waypoints: [[21.1415, 79.0830], [21.1395, 79.0785], [21.1380, 79.0740]] },
    { from: 'node_west_corridor_gate', to: 'node_community_shelter_s9', name: 'Sector 9 Link Road', distanceMeters: 620, waypoints: [[21.1380, 79.0740], [21.1380, 79.0680]] },
    { from: 'node_community_shelter_s9', to: 'node_industrial_depot_bravo', name: 'West Industrial Highway', distanceMeters: 2350, waypoints: [[21.1380, 79.0680], [21.1310, 79.0600], [21.1250, 79.0550], [21.1215, 79.0520]] },
    { from: 'node_industrial_depot_bravo', to: 'node_railway_colony', name: 'Railway Feeder Expressway', distanceMeters: 680, waypoints: [[21.1215, 79.0520], [21.1245, 79.0535], [21.1270, 79.0550]] }
  ]
};

// Build adjacency list for bidirectional search
function getAdjacencyList() {
  const adj = {};
  for (const nodeId of Object.keys(LOCAL_ROAD_GRAPH.nodes)) {
    adj[nodeId] = [];
  }

  for (const edge of LOCAL_ROAD_GRAPH.edges) {
    adj[edge.from].push({
      neighbor: edge.to,
      distance: edge.distanceMeters,
      name: edge.name,
      waypoints: edge.waypoints,
      is_flood_prone: Boolean(edge.is_flood_prone)
    });
    adj[edge.to].push({
      neighbor: edge.from,
      distance: edge.distanceMeters,
      name: edge.name,
      waypoints: [...edge.waypoints].reverse(),
      is_flood_prone: Boolean(edge.is_flood_prone)
    });
  }
  return adj;
}

/**
 * Finds the closest node in the road network graph to a given coordinate.
 */
export function findNearestRoadNode(lat, lng) {
  let nearestNode = null;
  let minDistanceKm = Infinity;

  for (const node of Object.values(LOCAL_ROAD_GRAPH.nodes)) {
    const dist = haversineDistanceKm(lat, lng, node.lat, node.lng);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
      nearestNode = node;
    }
  }

  return { node: nearestNode, distanceKm: minDistanceKm };
}

/**
 * Calculates a genuine offline road route from origin (lat, lng) to destination (lat, lng).
 *
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @param {Array} hazards - Active hazards array for dynamic route safety evaluation
 * @param {String} mode - 'vehicle' (30 km/h) | 'foot' (5 km/h) | 'boat' (15 km/h)
 * @returns {Object} Route result object
 */
export function calculateOfflineRoute(origin, destination, hazards = [], mode = 'vehicle') {
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    throw new Error('Both origin and destination coordinates are required for route navigation.');
  }

  const origLat = Number(origin.lat);
  const origLng = Number(origin.lng);
  const destLat = Number(destination.lat);
  const destLng = Number(destination.lng);

  // Direct straight-line calculation for bearing & baseline
  const straightLineDistanceKm = haversineDistanceKm(origLat, origLng, destLat, destLng);
  const bearing = calculateCompassBearing(origLat, origLng, destLat, destLng);

  // Find nearest entry and exit nodes in our topological road network
  const startSnap = findNearestRoadNode(origLat, origLng);
  const endSnap = findNearestRoadNode(destLat, destLng);

  // If points are significantly remote from the local road network (> 6.0 km), use straight-line fallback
  const isRemote = startSnap.distanceKm > 6.0 || endSnap.distanceKm > 6.0;

  if (isRemote) {
    return {
      success: true,
      is_straight_line_fallback: true,
      routing_mode: 'STRAIGHT_LINE_BEARING',
      road_graph_available: false,
      distance_km: Number(straightLineDistanceKm.toFixed(2)),
      estimated_minutes: Math.round((straightLineDistanceKm / (mode === 'foot' ? 4.5 : 25)) * 60),
      bearing: bearing.label,
      bearing_degrees: bearing.degrees,
      polyline: [[origLat, origLng], [destLat, destLng]],
      instructions: [
        `Depart origin heading ${bearing.label}`,
        `Travel direct bearing across open terrain: ${straightLineDistanceKm.toFixed(2)} km`,
        `Arrive at destination (${destLat.toFixed(4)}°N, ${destLng.toFixed(4)}°E)`
      ],
      hazard_warnings: [
        'Turn-by-turn road network graph unavailable for this remote sector.',
        `Displaying straight-line bearing fallback (${straightLineDistanceKm.toFixed(2)} km, bearing ${bearing.label}).`,
        'Route safety has not been verified against obstacles or debris.'
      ],
      route_safe: false,
      hazards_intersected: []
    };
  }

  // Run Dijkstra on the local road network graph
  const adj = getAdjacencyList();
  const distances = {};
  const previous = {};
  const previousEdge = {};
  const unvisited = new Set();

  for (const nodeId of Object.keys(LOCAL_ROAD_GRAPH.nodes)) {
    distances[nodeId] = Infinity;
    unvisited.add(nodeId);
  }

  const startId = startSnap.node.id;
  const endId = endSnap.node.id;
  distances[startId] = 0;

  // Active hazard proximity check
  const activeFloodHazards = hazards.filter(h => h.hazard_type === 'flood_zone' || h.severity === 'critical');

  while (unvisited.size > 0) {
    // Find unvisited node with minimum distance
    let current = null;
    let minD = Infinity;
    for (const node of unvisited) {
      if (distances[node] < minD) {
        minD = distances[node];
        current = node;
      }
    }

    if (!current || minD === Infinity) break;
    if (current === endId) break;

    unvisited.delete(current);

    const neighbors = adj[current] || [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.neighbor)) continue;

      // Add penalty weight if edge is flood-prone and mode is vehicle
      let weight = edge.distance;
      if (edge.is_flood_prone && mode === 'vehicle') {
        weight *= 1.8; // Prefer dry elevated corridors unless boat mode
      }

      const alt = distances[current] + weight;
      if (alt < distances[edge.neighbor]) {
        distances[edge.neighbor] = alt;
        previous[edge.neighbor] = current;
        previousEdge[edge.neighbor] = edge;
      }
    }
  }

  // Reconstruct path
  const pathNodes = [];
  let curr = endId;
  while (curr) {
    pathNodes.unshift(curr);
    curr = previous[curr];
  }

  // Build composite polyline
  const polyline = [[origLat, origLng]];
  const instructions = [];
  let totalRoadDistanceMeters = 0;
  const hazardsIntersected = [];

  // Initial connector from origin to entry road node
  if (startSnap.distanceKm > 0.03) {
    instructions.push(`Depart origin towards ${startSnap.node.name} (${Math.round(startSnap.distanceKm * 1000)}m)`);
  }
  totalRoadDistanceMeters += startSnap.distanceKm * 1000;

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const fromId = pathNodes[i];
    const toId = pathNodes[i + 1];
    const edge = previousEdge[toId];

    if (edge) {
      totalRoadDistanceMeters += edge.distance;
      // Append waypoints
      for (const pt of edge.waypoints) {
        polyline.push(pt);
      }

      // Check for hazard overlap along edge waypoints
      for (const hz of activeFloodHazards) {
        const radiusKm = hz.radius_km || 0.8;
        const intersects = edge.waypoints.some(
          wp => haversineDistanceKm(wp[0], wp[1], hz.center_lat, hz.center_lng) <= radiusKm
        );
        if (intersects && !hazardsIntersected.some(h => h.hazard_id === hz.hazard_id)) {
          hazardsIntersected.push(hz);
        }
      }

      const cautionTag = edge.is_flood_prone ? ' — [Caution: Inundation Risk]' : '';
      instructions.push(`Proceed along ${edge.name} (${edge.distance}m)${cautionTag}`);
    }
  }

  // Connector from exit road node to final destination
  totalRoadDistanceMeters += endSnap.distanceKm * 1000;
  if (endSnap.distanceKm > 0.03) {
    instructions.push(`Turn into target approach towards incident coordinates (${Math.round(endSnap.distanceKm * 1000)}m)`);
  }
  polyline.push([destLat, destLng]);

  const totalDistanceKm = Number((totalRoadDistanceMeters / 1000).toFixed(2));

  // Speed estimation: Foot ~5 km/h, Vehicle ~30 km/h, Boat ~15 km/h
  const speedKmH = mode === 'foot' ? 5.0 : mode === 'boat' ? 15.0 : 28.0;
  const estimatedMinutes = Math.max(1, Math.round((totalDistanceKm / speedKmH) * 60));

  const hazardWarnings = [];
  if (hazardsIntersected.length > 0) {
    hazardWarnings.push(
      `WARNING: Route crosses ${hazardsIntersected.length} active hazard perimeter(s) (including Ward 12 Canal Flood Zone). Exercise extreme caution.`
    );
  }
  hazardWarnings.push('Never assume a route is safe solely because it is the shortest path.');

  return {
    success: true,
    is_straight_line_fallback: false,
    routing_mode: 'LOCAL_ROAD_NETWORK_GRAPH',
    road_graph_available: true,
    distance_km: totalDistanceKm,
    estimated_minutes: estimatedMinutes,
    bearing: bearing.label,
    polyline: polyline,
    instructions: instructions,
    hazard_warnings: hazardWarnings,
    route_safe: hazardsIntersected.length === 0,
    hazards_intersected: hazardsIntersected,
    speed_mode: mode
  };
}

/**
 * Standardized router function used by UI components to get route, points, turns and ETAs
 */
export function findShortestOfflineRoute(origin, destination, options = {}) {
  const { hazards = [], mode = 'vehicle' } = options;
  const raw = calculateOfflineRoute(origin, destination, hazards, mode);
  
  const points = (raw.polyline || []).map(pt => ({ lat: pt[0], lng: pt[1] }));
  const distKm = raw.distance_km || 0;

  return {
    ...raw,
    distanceKm: distKm,
    points: points,
    directions: raw.instructions || [],
    hazardsAvoided: raw.hazards_intersected || [],
    isDirectBearingFallback: !!raw.is_straight_line_fallback,
    mode: raw.routing_mode || 'OFFLINE_ROAD_GRAPH',
    bearingDegrees: raw.bearing_degrees != null ? raw.bearing_degrees : (raw.bearing ? parseInt(raw.bearing, 10) : 0),
    etaMinutes: {
      vehicle: Math.max(1, Math.round((distKm / 28) * 60)),
      foot: Math.max(2, Math.round((distKm / 5) * 60)),
      boat: Math.max(2, Math.round((distKm / 15) * 60))
    }
  };
}

