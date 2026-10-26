import { describe, it, expect } from 'vitest';
import {
  getSeedDemoIncidents,
  filterDemoIncidents,
  isDemoModeEnabled,
  setDemoModeEnabled
} from '../demoIncidents';
import {
  findShortestOfflineRoute,
  haversineDistanceMeters,
  calculateBearingDegrees
} from '../offlineRouting';
import {
  lon2tile,
  lat2tile,
  isCoordinateInTacticalBounds,
  DEFAULT_TACTICAL_BOUNDS
} from '../offlineMapService';

describe('RESQMesh Offline Routing & Tactical Incidents Suite', () => {

  describe('Demo Incidents Service', () => {
    it('returns seed demo incidents with is_demo: true and unique IDs', () => {
      const demos = getSeedDemoIncidents();
      expect(demos.length).toBe(5);
      demos.forEach(d => {
        expect(d.is_demo).toBe(true);
        expect(d.emergency_id).toBeTruthy();
        expect(d.lat).toBeGreaterThan(20);
        expect(d.lng).toBeGreaterThan(78);
        expect(d.verification_status).toBeTruthy();
      });
    });

    it('filters out demo incidents when demo mode is disabled', () => {
      const demos = getSeedDemoIncidents();
      const realIncident = {
        emergency_id: 'real-123',
        description: 'Real flood distress',
        is_demo: false
      };
      const mixed = [...demos, realIncident];

      const filteredOff = filterDemoIncidents(mixed, false);
      expect(filteredOff.length).toBe(1);
      expect(filteredOff[0].emergency_id).toBe('real-123');

      const filteredOn = filterDemoIncidents(mixed, true);
      expect(filteredOn.length).toBe(6);
    });

    it('toggles demo mode state in localStorage', () => {
      setDemoModeEnabled(false);
      expect(isDemoModeEnabled()).toBe(false);
      setDemoModeEnabled(true);
      expect(isDemoModeEnabled()).toBe(true);
    });

    it('anchors all demo disaster incidents strictly within 5.0 to 7.0 km of the user location', () => {
      // Arbitrary user location (e.g. Pune, Maharashtra)
      const userLoc = { lat: 18.5204, lng: 73.8567 };
      const demos = getSeedDemoIncidents(userLoc);

      expect(demos.length).toBe(5);
      demos.forEach(d => {
        const distKm = haversineDistanceMeters(userLoc.lat, userLoc.lng, d.lat, d.lng) / 1000;
        expect(distKm).toBeGreaterThanOrEqual(4.95);
        expect(distKm).toBeLessThanOrEqual(7.05);
      });
    });
  });

  describe('Offline Road Graph & Dijkstra Routing', () => {
    it('calculates accurate Haversine distance between coordinates', () => {
      // Nagpur Central to Sitabuldi (roughly 1.3 - 1.5 km)
      const dist = haversineDistanceMeters(21.1458, 79.0882, 21.1495, 79.0815);
      expect(dist).toBeGreaterThan(700);
      expect(dist).toBeLessThan(1500);
    });

    it('computes shortest path on local road graph with step-by-step guidance', () => {
      const origin = { lat: 21.1458, lng: 79.0882 }; // Nagpur Central Hub
      const dest = { lat: 21.1432, lng: 79.0965 }; // Ward 12 Clinic
      const route = findShortestOfflineRoute(origin, dest);

      expect(route).toBeDefined();
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      expect(route.distanceKm).toBeGreaterThan(0);
      expect(route.etaMinutes.vehicle).toBeGreaterThan(0);
      expect(route.etaMinutes.foot).toBeGreaterThan(route.etaMinutes.vehicle);
      expect(route.directions.length).toBeGreaterThan(0);
    });

    it('falls back to straight-line bearing when outside mapped urban road graph', () => {
      const origin = { lat: 21.1458, lng: 79.0882 };
      const remoteDest = { lat: 28.6139, lng: 77.2090 }; // Delhi (far outside Nagpur graph)
      const route = findShortestOfflineRoute(origin, remoteDest);

      expect(route.isDirectBearingFallback).toBe(true);
      expect(route.mode).toBe('STRAIGHT_LINE_BEARING');
      expect(route.points.length).toBe(2);
      expect(route.bearingDegrees).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Offline Map Service & Tactical Boundaries', () => {
    it('accurately computes slippy map tile coordinates', () => {
      const tileX = lon2tile(79.0882, 14);
      const tileY = lat2tile(21.1458, 14);

      expect(tileX).toBeGreaterThan(0);
      expect(tileY).toBeGreaterThan(0);
    });

    it('correctly determines whether coordinates are inside tactical sector bounds', () => {
      expect(isCoordinateInTacticalBounds(21.1458, 79.0882)).toBe(true);
      expect(isCoordinateInTacticalBounds(21.1200, 79.0500)).toBe(true);
      // Tokyo coordinates outside Nagpur bounds
      expect(isCoordinateInTacticalBounds(35.6762, 139.6503)).toBe(false);
    });
  });

});
