import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Layers, Navigation, ZoomIn, ZoomOut } from 'lucide-react';

export default function TacticalMap({
  incidents = [],
  depots = [],
  vehicles = [],
  selectedIncident,
  onSelectIncident,
  onMapClickCoordinates
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const depotsLayerRef = useRef(null);
  const vehiclesLayerRef = useRef(null);

  const [currentZoom, setCurrentZoom] = useState(13);
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Initialize Map Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultLat = 21.1458;
    const defaultLng = 79.0882;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false
    });

    // Clean OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.95
    }).addTo(map);

    // Layer Groups
    depotsLayerRef.current = L.layerGroup().addTo(map);
    vehiclesLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Map click handler
    map.on('click', (e) => {
      if (onMapClickCoordinates) {
        onMapClickCoordinates({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render Incidents Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    incidents.forEach((inc) => {
      const isCritical = inc.severity === 'Critical';
      const isHigh = inc.severity === 'High';
      const color = isCritical ? '#ef4444' : isHigh ? '#f97316' : '#eab308';
      const pulseClass = isCritical ? 'beacon-pulse' : '';

      const iconHtml = `
        <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" class="${pulseClass}">
          ${inc.category.charAt(0).toUpperCase()}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-incident-pin',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([inc.lat, inc.lng], { icon: customIcon });

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 font-sans';
      popupContent.innerHTML = `
        <div style="font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 14px; text-transform: uppercase; color: #553a34; margin-bottom: 2px;">
          ${inc.category} Crisis
        </div>
        <div style="font-size: 11px; color: ${color}; font-weight: 600; margin-bottom: 4px;">
          SEVERITY: ${inc.severity.toUpperCase()} (URGENCY ${inc.urgency}/10)
        </div>
        <p style="font-size: 12px; color: #422d29; margin-bottom: 8px; line-height: 1.3;">
          ${inc.description.slice(0, 90)}...
        </p>
        <button id="track-btn-${inc.incident_id}" style="width: 100%; background: #553a34; color: white; font-size: 11px; padding: 6px 10px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border: none; cursor: pointer;">
          Track Incident & Updates
        </button>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`track-btn-${inc.incident_id}`);
        if (btn) {
          btn.onclick = () => onSelectIncident(inc);
        }
      });

      markersLayerRef.current.addLayer(marker);
    });
  }, [incidents, onSelectIncident]);

  // Render Depots & Coverage Circles
  useEffect(() => {
    if (!mapInstanceRef.current || !depotsLayerRef.current) return;
    depotsLayerRef.current.clearLayers();

    depots.forEach((d) => {
      const depotIcon = L.divIcon({
        className: 'depot-pin',
        html: `
          <div style="background-color: #3b82f6; width: 32px; height: 32px; border-radius: 6px; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
            🏛️
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([d.lat, d.lng], { icon: depotIcon });
      marker.bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: #1e3a8a;">${d.name}</div>
        <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">${d.sector}</div>
        <div style="font-size: 11px; font-family: monospace;">Food: ${d.food_units} | Water: ${d.water_units}L | Shelter: ${d.shelter_units}</div>
      `);
      depotsLayerRef.current.addLayer(marker);

      // 1.8km coverage circle
      const circle = L.circle([d.lat, d.lng], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        weight: 1.5,
        radius: 1800
      });
      depotsLayerRef.current.addLayer(circle);
    });
  }, [depots]);

  // Render Vehicles
  useEffect(() => {
    if (!mapInstanceRef.current || !vehiclesLayerRef.current) return;
    vehiclesLayerRef.current.clearLayers();

    vehicles.forEach((v) => {
      const vehicleIcon = L.divIcon({
        className: 'vehicle-pin',
        html: `
          <div style="background-color: #10b981; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; box-shadow: 0 3px 8px rgba(0,0,0,0.25);">
            🚚
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker([v.current_lat, v.current_lng], { icon: vehicleIcon });
      marker.bindPopup(`
        <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: #065f46;">${v.vehicle_number}</div>
        <div style="font-size: 11px; color: #047857;">Type: ${v.vehicle_type}</div>
        <div style="font-size: 11px; font-weight: 600;">STATUS: ${v.status}</div>
      `);
      vehiclesLayerRef.current.addLayer(marker);
    });
  }, [vehicles]);

  // Recenter when an incident is selected from list
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedIncident) return;
    mapInstanceRef.current.flyTo([selectedIncident.lat, selectedIncident.lng], 15, {
      duration: 1.2
    });
  }, [selectedIncident]);

  const handleLocateMe = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setIsLocating(false);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([coords.lat, coords.lng], 15);
          L.circleMarker([coords.lat, coords.lng], {
            radius: 8,
            fillColor: '#974726',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(mapInstanceRef.current).bindPopup('Your Current Location').openPopup();
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
        alert('Could not retrieve location. Using tactical command center default coordinates.');
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className="relative w-full h-full min-h-[480px] bg-slate-100 overflow-hidden">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Tactical Overlay Controls */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col space-y-2">
        <button
          onClick={handleLocateMe}
          className="bg-white/95 hover:bg-white text-espresso p-2.5 rounded-sm shadow-md border border-tactical-border hover:shadow-lg transition flex items-center justify-center"
          title="Locate my position"
        >
          <Crosshair className={`w-5 h-5 ${isLocating ? 'animate-spin text-rust' : ''}`} />
        </button>

        <div className="bg-white/95 rounded-sm shadow-md border border-tactical-border flex flex-col overflow-hidden">
          <button
            onClick={() => mapInstanceRef.current && mapInstanceRef.current.zoomIn()}
            className="p-2.5 text-espresso hover:bg-espresso-50 border-b border-tactical-border transition"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapInstanceRef.current && mapInstanceRef.current.zoomOut()}
            className="p-2.5 text-espresso hover:bg-espresso-50 transition"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="absolute bottom-4 left-4 z-[500] hidden sm:flex items-center space-x-3 bg-white/95 backdrop-blur-sm px-3.5 py-1.5 rounded-sm border border-tactical-border text-xs shadow-md">
        <div className="flex items-center space-x-1.5">
          <Navigation className="w-3.5 h-3.5 text-rust" />
          <span className="font-mono text-[11px] text-espresso-700">
            GRID: 21.1458°N, 79.0882°E
          </span>
        </div>
        <span className="text-tactical-borderDark">|</span>
        <div className="font-mono text-[11px] text-espresso-600">
          ZOOM: {currentZoom}x
        </div>
        <span className="text-tactical-borderDark">|</span>
        <div className="flex items-center space-x-1 text-[11px] text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>LIVE TRAFFIC ROUTING</span>
        </div>
      </div>
    </div>
  );
}
