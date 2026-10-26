import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Crosshair, Layers, Navigation, ZoomIn, ZoomOut, AlertCircle, 
  Shield, Truck, Waves, AlertTriangle, MapPin, Download, CheckCircle2,
  HardDrive, Info, ShieldCheck, ShieldAlert, Route, X,
  Car, Footprints, RefreshCw, Zap, Compass, Clock
} from 'lucide-react';
import { createOfflineTileLayer, DEFAULT_TACTICAL_BOUNDS, isCoordinateInTacticalBounds, createTacticalBoundsAroundPoint } from '../services/offlineMapService';

export default function OperationsMap({
  emergencies = [],
  responders = [],
  hazards = [],
  dispatches = [],
  meshStatus,
  userLocation,
  onRequestUserLocation,
  selectedEmergency,
  onSelectEmergency,
  onProposeDispatch,
  activeRoute = null,
  onClearActiveRoute = null,
  onRecalculateRoute = null,
  onOpenOfflineManager = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const victimsLayerRef = useRef(null);
  const respondersLayerRef = useRef(null);
  const hazardsLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const activeNavigationLayerRef = useRef(null);
  const meshLinesLayerRef = useRef(null);
  const userLocationLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const hasAutoCenteredRef = useRef(false);

  const [currentZoom, setCurrentZoom] = useState(13);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterVerification, setFilterVerification] = useState('ALL');
  const [isOfflineGridMode, setIsOfflineGridMode] = useState(false);
  const [isOutOfCoverage, setIsOutOfCoverage] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Tactical baseline center: Center on user location if available, otherwise default
    const defaultCenter = [21.1458, 79.0882];
    const userLat = Number(userLocation?.coords?.lat);
    const userLng = Number(userLocation?.coords?.lng);
    const hasValidUserCoords = userLocation?.coords && isFinite(userLat) && isFinite(userLng);
    const initialLat = hasValidUserCoords ? userLat : defaultCenter[0];
    const initialLng = hasValidUserCoords ? userLng : defaultCenter[1];

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 12,
      zoomControl: false,
      attributionControl: true
    });

    const osmTileUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_URL)
      || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const osmAttribution = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_ATTRIBUTION)
      || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

    // Use standard Leaflet tile layer with OSM tiles or custom offline layer
    let tileLayer = null;
    try {
      tileLayer = createOfflineTileLayer(L, osmTileUrl, {
        maxZoom: 18,
        attribution: osmAttribution
      });
    } catch (e) {
      console.warn('Using standard Leaflet TileLayer:', e);
    }

    if (!tileLayer) {
      tileLayer = L.tileLayer(osmTileUrl, {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: osmAttribution,
        crossOrigin: true
      });
    }

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // Layer Groups in z-index order
    hazardsLayerRef.current = L.layerGroup().addTo(map);
    meshLinesLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);
    activeNavigationLayerRef.current = L.layerGroup().addTo(map);
    victimsLayerRef.current = L.layerGroup().addTo(map);
    respondersLayerRef.current = L.layerGroup().addTo(map);
    userLocationLayerRef.current = L.layerGroup().addTo(map);

    map.on('zoomend', () => setCurrentZoom(map.getZoom()));
    map.on('moveend', () => {
      const center = map.getCenter();
      const userCoords = userLocation?.coords;
      const bounds = (userCoords?.lat != null && userCoords?.lng != null && isFinite(Number(userCoords.lat)) && isFinite(Number(userCoords.lng)))
        ? createTacticalBoundsAroundPoint(Number(userCoords.lat), Number(userCoords.lng), 15)
        : DEFAULT_TACTICAL_BOUNDS;
      const inCoverage = isCoordinateInTacticalBounds(center.lat, center.lng, bounds);
      setIsOutOfCoverage(!inCoverage);
    });

    mapInstanceRef.current = map;

    // Handle container resizing smoothly
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);
    const initTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Toggle offline tile layer opacity
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setOpacity(isOfflineGridMode ? 0 : 1);
    }
  }, [isOfflineGridMode]);

  // Render User's Live or Last-Known Location from Geolocation API & Local Cache
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocationLayerRef.current) return;
    userLocationLayerRef.current.clearLayers();

    if (userLocation?.coords && isFinite(Number(userLocation.coords.lat)) && isFinite(Number(userLocation.coords.lng))) {
      const lat = Number(userLocation.coords.lat);
      const lng = Number(userLocation.coords.lng);
      const accuracy = Number(userLocation.coords.accuracy || 15);
      const isFreshGps = Boolean(userLocation.isRealGps && !userLocation.coords.is_last_known);

      if (!hasAutoCenteredRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([lat, lng], 15, { duration: 1.2 });
        hasAutoCenteredRef.current = true;
      }

      const pinBg = isFreshGps ? '#168BFA' : '#f59e0b';
      const shadowRgba = isFreshGps ? 'rgba(22, 139, 250, 0.6)' : 'rgba(245, 158, 11, 0.6)';
      const statusTitle = isFreshGps ? 'Current GPS location' : 'Last known location';

      const iconHtml = `
        <div style="background-color: ${pinBg}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #ffffff; box-shadow: 0 0 20px ${shadowRgba};" class="${isFreshGps ? 'pulse-cyan' : ''}">
          ${isFreshGps ? '📍' : '⏳'}
        </div>
      `;

      const userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'user-pin', html: iconHtml, iconSize: [34, 34], iconAnchor: [17, 17] }),
        zIndexOffset: 1000
      });

      const ageText = !isFreshGps && userLocation.coords.measured_at
        ? ` · Traced: ${new Date(userLocation.coords.measured_at).toLocaleTimeString()}`
        : '';

      userMarker.bindTooltip(`📍 ${statusTitle} (±${Math.round(accuracy)}m)${ageText}`, {
        permanent: true,
        direction: 'top',
        className: isFreshGps ? 'user-gps-tooltip' : 'user-gps-tooltip-cached',
        offset: [0, -18]
      });

      userMarker.bindPopup(`
        <div style="font-family: sans-serif; padding: 6px; color: #102B4E; min-width: 210px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #D0E6FC; padding-bottom: 4px; margin-bottom: 4px;">
            <strong style="color: ${pinBg}; text-transform: uppercase; font-size: 12px;">${statusTitle}</strong>
            <span style="background: ${isFreshGps ? '#EAF5FF' : '#FEF3C7'}; color: ${pinBg}; font-size: 10px; font-weight: bold; padding: 1px 4px; border-radius: 2px;">
              ${isFreshGps ? 'LIVE GNSS FIX' : 'CACHED FIX'}
            </span>
          </div>
          <div style="font-size: 11px; font-family: monospace; font-weight: bold; color: #102B4E;">
            ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E
          </div>
          <div style="font-size: 10px; color: #627D98; margin-top: 2px;">
            GPS Accuracy: ±${Math.round(accuracy)} m
          </div>
          ${!isFreshGps && userLocation.coords.measured_at ? `
            <div style="font-size: 10px; color: #b45309; margin-top: 2px; font-weight: 600;">
              Measured at: ${new Date(userLocation.coords.measured_at).toLocaleTimeString()}
            </div>
          ` : ''}
        </div>
      `);
      userLocationLayerRef.current.addLayer(userMarker);

      const userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: pinBg,
        fillColor: pinBg,
        fillOpacity: isFreshGps ? 0.12 : 0.08,
        weight: 1.5,
        dashArray: isFreshGps ? '3, 5' : '5, 5'
      });
      userLocationLayerRef.current.addLayer(userAccuracyCircle);

      // 5 km Inner Disaster Response Boundary
      const zone5km = L.circle([lat, lng], {
        radius: 5000,
        color: '#168BFA',
        fillColor: '#168BFA',
        fillOpacity: 0.02,
        weight: 1.5,
        dashArray: '4, 8'
      }).bindTooltip('5 km Disaster Response Perimeter', { direction: 'top', className: 'text-[10px]' });
      userLocationLayerRef.current.addLayer(zone5km);

      // 7 km Outer Disaster Response Boundary
      const zone7km = L.circle([lat, lng], {
        radius: 7000,
        color: '#0284c7',
        fillColor: '#0284c7',
        fillOpacity: 0.03,
        weight: 1.5,
        dashArray: '6, 12'
      }).bindTooltip('7 km Disaster Response Perimeter', { direction: 'top', className: 'text-[10px]' });
      userLocationLayerRef.current.addLayer(zone7km);
    }
  }, [userLocation]);

  // Center on User GPS or Last-Known Location
  const handleFlyToUserLocation = () => {
    if (userLocation?.coords && mapInstanceRef.current) {
      const lat = Number(userLocation.coords.lat);
      const lng = Number(userLocation.coords.lng);
      if (isFinite(lat) && isFinite(lng)) {
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 1.2 });
        return;
      }
    }
    if (onRequestUserLocation) {
      onRequestUserLocation();
    }
  };

  // Render Hazards
  useEffect(() => {
    if (!mapInstanceRef.current || !hazardsLayerRef.current) return;
    hazardsLayerRef.current.clearLayers();

    hazards.forEach((hz) => {
      if (!hz) return;
      const lat = Number(hz.center_lat ?? hz.lat);
      const lng = Number(hz.center_lng ?? hz.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;

      const isFlood = hz.hazard_type === 'flood_zone';
      const color = isFlood ? '#0284c7' : '#f59e0b';
      const fillColor = isFlood ? '#38bdf8' : '#ef4444';
      const radiusMeters = Number(hz.radius_km || 0.8) * 1000;

      const circle = L.circle([lat, lng], {
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: '4, 4',
        radius: radiusMeters
      });

      circle.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px; color: #102B4E;">
          <strong style="color: #102B4E; text-transform: uppercase;">${hz.name || 'Hazard Zone'}</strong><br/>
          <span style="font-size: 11px; color: #dc2626; font-weight: bold;">SEVERITY: ${String(hz.severity || 'HIGH').toUpperCase()}</span><br/>
          <span style="font-size: 11px; color: #627D98;">Radius: ${Math.round(radiusMeters)}m hazard perimeter</span>
        </div>
      `);
      hazardsLayerRef.current.addLayer(circle);
    });
  }, [hazards]);

  // Render Mesh Topology Links
  useEffect(() => {
    if (!mapInstanceRef.current || !meshLinesLayerRef.current || !meshStatus?.nodes) return;
    meshLinesLayerRef.current.clearLayers();

    const nodeCoords = {};
    (meshStatus.nodes || []).forEach(n => {
      if (n && isFinite(n.lat) && isFinite(n.lng)) {
        nodeCoords[n.node_id] = [Number(n.lat), Number(n.lng)];
      }
    });

    const isPartitioned = meshStatus.is_partitioned;

    (meshStatus.nodes || []).forEach(n => {
      if (!n || !nodeCoords[n.node_id]) return;
      (n.peers || []).forEach(peerId => {
        if (nodeCoords[peerId]) {
          const isCrossBridge = (String(n.node_id).includes('alpha') && String(peerId).includes('bravo')) ||
                                (String(n.node_id).includes('bravo') && String(peerId).includes('alpha'));

          if (!isPartitioned || !isCrossBridge) {
            const line = L.polyline([nodeCoords[n.node_id], nodeCoords[peerId]], {
              color: isCrossBridge ? '#f59e0b' : '#168BFA',
              weight: 1.5,
              opacity: 0.45,
              dashArray: '3, 6'
            });
            meshLinesLayerRef.current.addLayer(line);
          }
        }
      });
    });

    // Render Multi-Hop SOS Relay Vectors
    (emergencies || []).forEach(emg => {
      if (emg && emg.relay_path && emg.relay_path.length > 0) {
        const destLat = Number(emg.lat ?? emg.latitude);
        const destLng = Number(emg.lng ?? emg.longitude);
        if (isFinite(destLat) && isFinite(destLng)) {
          const hopOffset = 0.003 * Math.min(3, emg.relay_path.length);
          const originPoint = [destLat + hopOffset, destLng - hopOffset];
          const vectorLine = L.polyline([originPoint, [destLat, destLng]], {
            color: '#06b6d4',
            weight: 2.5,
            opacity: 0.85,
            dashArray: '4, 6'
          });
          meshLinesLayerRef.current.addLayer(vectorLine);
        }
      }
    });
  }, [meshStatus, emergencies]);

  // Render Victims / Emergencies with Verification & Demo Badges
  useEffect(() => {
    if (!mapInstanceRef.current || !victimsLayerRef.current) return;
    victimsLayerRef.current.clearLayers();

    emergencies.forEach((emg) => {
      if (!emg) return;
      const lat = Number(emg.lat ?? emg.latitude);
      const lng = Number(emg.lng ?? emg.longitude);
      if (!isFinite(lat) || !isFinite(lng)) return;

      if (filterSeverity !== 'ALL' && emg.severity !== filterSeverity) return;
      if (filterVerification !== 'ALL' && (emg.verification_status || 'VERIFIED') !== filterVerification) return;

      const isCritical = emg.severity === 'CRITICAL' || emg.urgency >= 8;
      const isHigh = emg.severity === 'HIGH' || emg.urgency >= 6;
      const isHelpOffered = emg.assistance_status === 'HELP_OFFERED' || emg.status === 'HELP_OFFERED';
      const isResolved = emg.status === 'RESOLVED';

      let pinColor = isCritical ? '#ef4444' : isHigh ? '#f59e0b' : '#168BFA';
      if (isHelpOffered) pinColor = '#10b981';
      if (isResolved) pinColor = '#64748b';

      const isDemo = !!emg.is_demo;

      const iconHtml = `
        <div style="background-color: ${pinColor}; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.25); position: relative;">
          ${emg.urgency || 5}
          ${isDemo ? '<span style="position: absolute; top: -6px; right: -8px; background: #fef08a; color: #854d0e; font-size: 8px; font-weight: 900; padding: 1px 3px; border-radius: 3px; border: 1px solid #ca8a04;">DEMO</span>' : ''}
          ${isHelpOffered ? '<span style="position: absolute; bottom: -5px; right: -6px; background: #10b981; color: #ffffff; font-size: 9px; padding: 1px 2px; border-radius: 50%; border: 1px solid #ffffff;">✓</span>' : ''}
        </div>
      `;

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'victim-pin', html: iconHtml, iconSize: [30, 30], iconAnchor: [15, 15] })
      });

      const accuracyCircle = L.circle([lat, lng], {
        radius: Number(emg.location_accuracy_meters || emg.accuracy_meters || 30),
        color: pinColor,
        fillColor: pinColor,
        fillOpacity: 0.08,
        weight: 1
      });
      victimsLayerRef.current.addLayer(accuracyCircle);

      const popupHtml = document.createElement('div');
      popupHtml.className = 'font-sans p-1 text-[#102B4E]';
      const mapLink = emg.location_link || `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
      
      const vStatus = String(emg.verification_status || 'VERIFIED');
      const vBadgeColor = vStatus === 'VERIFIED' ? '#059669' : vStatus === 'SUSPICIOUS' ? '#dc2626' : '#0284c7';

      popupHtml.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
          <strong style="font-size: 13px; text-transform: uppercase; color: #102B4E;">
            ${emg.category || 'Emergency'}
          </strong>
          ${isDemo ? '<span style="background: #fef08a; color: #854d0e; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 3px;">DEMO</span>' : ''}
        </div>
        <div style="font-size: 11px; margin-bottom: 4px; display: flex; gap: 4px;">
          <span style="color: ${pinColor}; font-weight: bold;">URGENCY: ${emg.urgency || 5}/10</span>
          <span>·</span>
          <span style="color: ${vBadgeColor}; font-weight: bold;">${vStatus}</span>
        </div>
        <p style="font-size: 12px; margin-bottom: 6px; color: #334E68; line-height: 1.35;">
          ${emg.raw_message || emg.description || 'Emergency assistance requested.'}
        </p>
        <button id="inspect-emg-${emg.emergency_id || emg.incident_id || emg.id}" style="width: 100%; background: #168BFA; color: #FFFFFF; font-size: 11px; font-weight: bold; padding: 7px 10px; border-radius: 8px; border: none; cursor: pointer; text-transform: uppercase; transition: background 0.2s;">
          Open Dossier & Navigation →
        </button>
      `;

      marker.bindPopup(popupHtml);
      marker.on('popupopen', () => {
        const btn = document.getElementById(`inspect-emg-${emg.emergency_id || emg.incident_id || emg.id}`);
        if (btn) btn.onclick = () => onSelectEmergency(emg);
      });

      victimsLayerRef.current.addLayer(marker);
    });
  }, [emergencies, filterSeverity, filterVerification, onSelectEmergency]);

  // Render Responders
  useEffect(() => {
    if (!mapInstanceRef.current || !respondersLayerRef.current) return;
    respondersLayerRef.current.clearLayers();

    responders.forEach((resp) => {
      if (!resp) return;
      const lat = Number(resp.current_lat ?? resp.lat ?? resp.latitude);
      const lng = Number(resp.current_lng ?? resp.lng ?? resp.longitude);
      if (!isFinite(lat) || !isFinite(lng)) return;

      const isAvailable = resp.status === 'AVAILABLE';
      const color = isAvailable ? '#10b981' : '#a855f7';
      const hasBoat = (resp.capabilities || []).some(c => String(c).includes('boat') || String(c).includes('watercraft'));
      const hasMedical = (resp.capabilities || []).some(c => String(c).includes('paramedic') || String(c).includes('dialysis') || String(c).includes('surgeon'));

      const symbol = hasBoat ? '🚤' : hasMedical ? '🩺' : '🏃';

      const iconHtml = `
        <div style="background-color: #ffffff; width: 30px; height: 30px; border-radius: 8px; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
          ${symbol}
        </div>
      `;

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'resp-pin', html: iconHtml, iconSize: [30, 30], iconAnchor: [15, 15] })
      });

      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 2px; color: #102B4E;">
          <strong style="color: #102B4E;">${resp.name || 'Field Responder'}</strong><br/>
          <span style="font-size: 11px; color: #168BFA; font-weight: 600;">${resp.role || 'Field Responder'}</span><br/>
          <span style="font-size: 11px;">Status: <strong>${resp.status || 'AVAILABLE'}</strong> · Battery: <strong>${resp.battery_pct ?? 85}%</strong></span><br/>
          <span style="font-size: 10px; font-family: monospace; color: #627D98;">Trust: ${Math.round((resp.trust_score || 0.8) * 100)}%</span>
        </div>
      `);
      respondersLayerRef.current.addLayer(marker);
    });
  }, [responders]);

  // Render Active Navigation Route
  useEffect(() => {
    if (!mapInstanceRef.current || !activeNavigationLayerRef.current) return;
    activeNavigationLayerRef.current.clearLayers();

    if (activeRoute && Array.isArray(activeRoute.points) && activeRoute.points.length > 0) {
      const latLngs = activeRoute.points
        .filter(p => p && isFinite(p.lat) && isFinite(p.lng))
        .map(p => [Number(p.lat), Number(p.lng)]);

      if (latLngs.length < 2) return;

      // Route glow / border
      const outline = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 7,
        opacity: 0.4
      });
      activeNavigationLayerRef.current.addLayer(outline);

      // Primary Route Polyline
      const line = L.polyline(latLngs, {
        color: '#168BFA',
        weight: 4,
        opacity: 0.95,
        dashArray: activeRoute.isDirectBearingFallback ? '8, 8' : undefined
      });
      activeNavigationLayerRef.current.addLayer(line);

      // Start Pin
      const startPt = latLngs[0];
      const startMarker = L.marker(startPt, {
        icon: L.divIcon({
          className: 'start-pin',
          html: '<div style="background:#168BFA;color:#fff;width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">A</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });
      activeNavigationLayerRef.current.addLayer(startMarker);

      // End Pin
      const endPt = latLngs[latLngs.length - 1];
      const endMarker = L.marker(endPt, {
        icon: L.divIcon({
          className: 'end-pin',
          html: '<div style="background:#ef4444;color:#fff;width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">B</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });
      activeNavigationLayerRef.current.addLayer(endMarker);

      // Fit map to route bounds safely
      try {
        mapInstanceRef.current.fitBounds(line.getBounds(), { padding: [40, 40] });
      } catch (e) {}
    }
  }, [activeRoute]);

  return (
    <div className="relative w-full h-full min-h-[520px] bg-slate-100 overflow-hidden border border-[#D0E6FC] rounded-2xl">
      
      {/* Leaflet Map DOM Element */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${isOfflineGridMode ? 'bg-[#f8fafc]' : ''}`}
        style={isOfflineGridMode ? {
          backgroundImage: `
            linear-gradient(to right, rgba(22, 139, 250, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(22, 139, 250, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        } : {}}
      />

      {/* Floating Tactical Filter Controls */}
      <div className="absolute top-4 left-4 z-[500] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#D0E6FC] shadow-md text-xs">
        <span className="text-slate-500 font-bold uppercase text-[10px] mr-1">Severity:</span>
        {['ALL', 'CRITICAL', 'HIGH'].map(sev => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev)}
            className={`px-2.5 py-0.5 rounded-lg text-[10px] uppercase font-bold transition border ${
              filterSeverity === sev
                ? 'bg-[#168BFA] text-white border-[#168BFA]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {sev}
          </button>
        ))}

        <div className="h-3 w-px bg-slate-300 mx-1 hidden sm:block" />

        {/* Tactical Offline Grid Mode Toggle */}
        <button
          type="button"
          onClick={() => setIsOfflineGridMode(!isOfflineGridMode)}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition border flex items-center space-x-1 ${
            isOfflineGridMode
              ? 'bg-amber-100 text-amber-800 border-amber-300'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
          title="Toggle procedural tactical vector coordinate grid (zero external tiles)"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isOfflineGridMode ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
          <span>{isOfflineGridMode ? 'VECTOR GRID' : 'GRID'}</span>
        </button>

        {/* Offline Area Manager Trigger */}
        {onOpenOfflineManager && (
          <button
            type="button"
            onClick={onOpenOfflineManager}
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC] hover:bg-blue-100 transition flex items-center space-x-1"
          >
            <Download className="w-3 h-3" />
            <span>Pre-Cache Map</span>
          </button>
        )}
      </div>

      {/* Active Navigation Route Banner */}
      {activeRoute && (
        <div className="absolute top-16 left-4 z-[500] bg-white/95 backdrop-blur-md border border-[#168BFA] p-3 rounded-2xl shadow-xl flex flex-col space-y-2.5 text-xs max-w-sm sm:max-w-md animate-fade-in">
          {/* Header row: Status badges & Clear button */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="p-1 bg-[#EAF5FF] text-[#168BFA] rounded-lg">
                <Route className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-[#102B4E]">Tactical Route</span>
              
              {/* Engine badge */}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                activeRoute.engine === 'ONLINE_OSRM'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : activeRoute.engine === 'OFFLINE_ROAD_GRAPH'
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {activeRoute.engine === 'ONLINE_OSRM'
                  ? 'Online OSRM'
                  : activeRoute.engine === 'OFFLINE_ROAD_GRAPH'
                  ? 'Offline Road Graph'
                  : 'Straight-Line'}
              </span>

              {/* Origin freshness badge */}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeRoute.origin_telemetry?.is_cached
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              }`}>
                {activeRoute.origin_telemetry?.is_cached
                  ? `Cached: ${activeRoute.origin_telemetry?.age_text || 'Prior fix'}`
                  : 'Live GPS'}
              </span>
            </div>

            {onClearActiveRoute && (
              <button
                type="button"
                onClick={onClearActiveRoute}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                title="Clear Active Route"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Distance & ETA Row */}
          <div className="flex items-baseline justify-between bg-[#EAF5FF]/60 px-3 py-2 rounded-xl border border-[#D0E6FC]">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Total Distance</div>
              <div className="text-base font-extrabold text-[#168BFA]">
                {activeRoute.distance_km ?? activeRoute.distanceKm ?? '0.00'} km
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center justify-end space-x-1">
                <Clock className="w-3 h-3 text-[#168BFA]" />
                <span>ETA</span>
              </div>
              <div className="text-base font-extrabold text-[#102B4E]">
                {activeRoute.duration_minutes ?? activeRoute.etaMinutes?.vehicle ?? 10} min
              </div>
              <div className="text-[9px] text-slate-500 font-medium">
                (Estimate without live traffic)
              </div>
            </div>
          </div>

          {/* Travel Mode & Objective Toggles + Recalculate */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Travel Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
              <button
                type="button"
                onClick={() => onRecalculateRoute && onRecalculateRoute({
                  mode: 'driving',
                  objective: activeRoute.objective || 'shortest'
                })}
                className={`px-2 py-1 rounded-md font-bold flex items-center space-x-1 transition ${
                  (activeRoute.travel_mode || 'driving') === 'driving'
                    ? 'bg-[#168BFA] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Driving mode (~35 km/h)"
              >
                <Car className="w-3 h-3" />
                <span>Driving</span>
              </button>
              <button
                type="button"
                onClick={() => onRecalculateRoute && onRecalculateRoute({
                  mode: 'walking',
                  objective: activeRoute.objective || 'shortest'
                })}
                className={`px-2 py-1 rounded-md font-bold flex items-center space-x-1 transition ${
                  activeRoute.travel_mode === 'walking'
                    ? 'bg-[#168BFA] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Walking mode (~5 km/h)"
              >
                <Footprints className="w-3 h-3" />
                <span>Walking</span>
              </button>
            </div>

            {/* Objective Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
              <button
                type="button"
                onClick={() => onRecalculateRoute && onRecalculateRoute({
                  mode: activeRoute.travel_mode || 'driving',
                  objective: 'shortest'
                })}
                className={`px-2 py-1 rounded-md font-bold flex items-center space-x-1 transition ${
                  (!activeRoute.objective || activeRoute.objective === 'shortest')
                    ? 'bg-[#102B4E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Shortest distance road path"
              >
                <Compass className="w-3 h-3" />
                <span>Shortest</span>
              </button>
              <button
                type="button"
                onClick={() => onRecalculateRoute && onRecalculateRoute({
                  mode: activeRoute.travel_mode || 'driving',
                  objective: 'fastest'
                })}
                className={`px-2 py-1 rounded-md font-bold flex items-center space-x-1 transition ${
                  activeRoute.objective === 'fastest'
                    ? 'bg-[#102B4E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Fastest route by speed"
              >
                <Zap className="w-3 h-3" />
                <span>Fastest</span>
              </button>
            </div>

            {/* Recalculate button */}
            {onRecalculateRoute && (
              <button
                type="button"
                onClick={() => onRecalculateRoute({
                  mode: activeRoute.travel_mode || 'driving',
                  objective: activeRoute.objective || 'shortest'
                })}
                className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition"
                title="Recalculate route with fresh coordinates"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Hazard & Disaster Safety Warnings */}
          {activeRoute.hazards_intersected && activeRoute.hazards_intersected.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 p-2 rounded-xl text-[10px] flex items-start space-x-1.5 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Hazard Alert:</strong> Route passes near {activeRoute.hazards_intersected.length} active hazard zone(s). Flood waters or debris may block passage.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Out of Coverage Warning Banner */}
      {isOutOfCoverage && (
        <div className="absolute top-16 right-4 z-[500] bg-amber-50 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-md">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Outside cached sector boundary (Nagpur Sector). Tiles beyond this area may require connection.</span>
        </div>
      )}

      {/* Locate Me & Zoom Buttons */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col items-end space-y-2">
        <button
          onClick={handleFlyToUserLocation}
          className="bg-white hover:bg-[#EAF5FF] text-[#168BFA] px-3.5 py-2 rounded-xl border border-[#D0E6FC] shadow-md transition flex items-center space-x-2 text-xs font-bold"
          title="Center map on your real live GNSS / GPS satellite location"
        >
          <Crosshair className="w-4 h-4 text-[#168BFA] animate-pulse" />
          <span className="hidden sm:inline">FLY TO GNSS / GPS</span>
        </button>

        {userLocation?.isRealGps && userLocation?.coords && isFinite(userLocation.coords.lat) && isFinite(userLocation.coords.lng) ? (
          <div className="bg-white/95 border border-[#D0E6FC] px-3 py-2 rounded-xl text-[11px] text-[#102B4E] shadow-md hidden sm:block text-right">
            <div className="text-[#168BFA] font-bold flex items-center justify-end space-x-1">
              <span className="w-2 h-2 rounded-full bg-[#168BFA] animate-ping" />
              <span>LIVE GNSS / GPS FIX:</span>
            </div>
            <div className="text-[#102B4E] font-bold font-mono">
              {Number(userLocation.coords.lat).toFixed(5)}°N, {Number(userLocation.coords.lng).toFixed(5)}°E
            </div>
            <div className="text-slate-500 text-[10px] font-mono">
              Precision: ±{Math.round(userLocation.coords.accuracy || 10)}m
            </div>
          </div>
        ) : (
          <button
            onClick={onRequestUserLocation}
            className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 px-3 py-2 rounded-xl text-xs font-bold shadow-md hidden sm:flex items-center space-x-1.5"
            title="Click to detect your current position"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>GNSS INACTIVE (ACQUIRE NOW)</span>
          </button>
        )}

        <div className="bg-white rounded-xl shadow-md border border-[#D0E6FC] flex flex-col overflow-hidden">
          <button
            onClick={() => mapInstanceRef.current && mapInstanceRef.current.zoomIn()}
            className="p-2.5 text-[#102B4E] hover:bg-[#EAF5FF] border-b border-[#D0E6FC] transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapInstanceRef.current && mapInstanceRef.current.zoomOut()}
            className="p-2.5 text-[#102B4E] hover:bg-[#EAF5FF] transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-6 right-4 z-[500] hidden sm:flex flex-col space-y-1.5 bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-[#D0E6FC] shadow-md text-xs text-[#102B4E]">
        <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1 mb-1">
          Tactical Map Legend
        </div>
        {userLocation?.isRealGps && userLocation?.coords && (
          <div className="flex items-center space-x-2 text-[#168BFA] font-bold border-b border-slate-100 pb-1 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#168BFA] animate-ping" />
            <span>You (Live GNSS/GPS Fix: ±{Math.round(userLocation.coords.accuracy || 10)}m)</span>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span>Critical Emergency (Urgency 8-10)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>High Urgency Emergency (6-7)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Assistance Offered / Assigned</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-md border border-[#0284c7] bg-[#38bdf8]/20" />
          <span>Active Flood Hazard Zone</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded border border-amber-300">DEMO</span>
          <span className="text-[11px]">Hardcoded Simulation Marker</span>
        </div>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="absolute bottom-6 left-4 z-[500] hidden md:flex items-center space-x-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl border border-[#D0E6FC] text-xs shadow-md text-[#102B4E]">
        <div className="flex items-center space-x-1.5 text-[#168BFA] font-bold">
          <Navigation className="w-4 h-4" />
          <span className="font-mono text-[11px]">
            {userLocation?.isRealGps && userLocation?.coords && isFinite(userLocation.coords.lat) && isFinite(userLocation.coords.lng)
              ? `LIVE GNSS/GPS: ${Number(userLocation.coords.lat).toFixed(4)}°N, ${Number(userLocation.coords.lng).toFixed(4)}°E (±${Math.round(userLocation.coords.accuracy || 10)}m)`
              : 'GNSS/GPS STANDBY (SECTOR BROWSING)'}
          </span>
        </div>
        <span className="text-[#D0E6FC]">|</span>
        <div className="text-[11px] font-mono text-slate-500">ZOOM: {currentZoom}x</div>
        <span className="text-[#D0E6FC]">|</span>
        <div className="flex items-center space-x-1.5 text-emerald-700 font-bold text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>OFFLINE CACHE ENGINE ACTIVE</span>
        </div>
      </div>

    </div>
  );
}
