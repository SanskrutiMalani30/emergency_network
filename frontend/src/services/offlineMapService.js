/**
 * RESQMesh — Offline Map Service & Tile Caching
 * 
 * Manages client-side map tile caching for complete offline operation:
 * 1. Pre-downloads tactical area tiles (zoom 12-16) into IndexedDB
 * 2. Intercepts Leaflet tile requests to prioritize local cached blobs
 * 3. Fallback tactical grid canvas rendering when offline without pre-downloaded tile
 * 4. Boundary and coverage checking with out-of-bounds warning
 */

import { saveCachedTile, getCachedTile, getCachedTileStats, clearCachedTiles } from './offlineStorage';

// Tactical Default Coverage Area (Nagpur Operational Sector)
export const DEFAULT_TACTICAL_BOUNDS = {
  name: 'Nagpur Central & Ward 12 Disaster Sector',
  minLat: 21.1000,
  maxLat: 21.1900,
  minLng: 79.0300,
  maxLng: 79.1500,
  center: [21.1458, 79.0882],
  defaultZoom: 14
};

// Coordinate to Slippy Tile Number conversions
export function lon2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

export function lat2tile(lat, zoom) {
  return Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
  );
}

export function tile2lon(x, zoom) {
  return (x / Math.pow(2, zoom) * 360 - 180);
}

export function tile2lat(y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

/**
 * Computes all tile keys required for a bounding box and zoom range
 */
export function getTileKeysForBounds(bounds = DEFAULT_TACTICAL_BOUNDS, minZoom = 13, maxZoom = 15) {
  const tiles = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const left = lon2tile(bounds.minLng, z);
    const right = lon2tile(bounds.maxLng, z);
    const top = lat2tile(bounds.maxLat, z);
    const bottom = lat2tile(bounds.minLat, z);

    const xMin = Math.min(left, right);
    const xMax = Math.max(left, right);
    const yMin = Math.min(top, bottom);
    const yMax = Math.max(top, bottom);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y, key: `tile:${z}/${x}/${y}` });
      }
    }
  }
  return tiles;
}

/**
 * Checks if a coordinate is inside the tactical coverage area
 */
export function isCoordinateInTacticalBounds(lat, lng, bounds = DEFAULT_TACTICAL_BOUNDS) {
  if (lat == null || lng == null) return false;
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

/**
 * Creates a tactical coverage boundary centered dynamically on the user's location.
 */
export function createTacticalBoundsAroundPoint(lat, lng, radiusKm = 10) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
    return DEFAULT_TACTICAL_BOUNDS;
  }
  const latDelta = radiusKm / 111.32;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusKm / (111.32 * (Math.abs(cosLat) > 0.01 ? cosLat : 1.0));
  return {
    name: `Local Disaster Sector (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
    center: [lat, lng],
    defaultZoom: 13
  };
}

/**
 * Downloads map tiles for a tactical area and stores them in IndexedDB.
 * Respects tile server rate limits with progressive delays.
 */
export async function downloadTacticalAreaTiles(options = {}, onProgress = null) {
  const {
    bounds = DEFAULT_TACTICAL_BOUNDS,
    minZoom = 13,
    maxZoom = 15,
    tileUrlPattern = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  } = options;

  const tiles = getTileKeysForBounds(bounds, minZoom, maxZoom);
  const total = tiles.length;
  let completed = 0;
  let successful = 0;
  let failed = 0;

  for (const t of tiles) {
    const key = t.key;
    // Check if already in cache
    const existing = await getCachedTile(key);
    if (existing) {
      completed++;
      successful++;
      if (onProgress) {
        onProgress({
          completed,
          total,
          percent: Math.round((completed / total) * 100),
          currentZoom: t.z,
          status: 'cached'
        });
      }
      continue;
    }

    // Download tile
    const url = tileUrlPattern
      .replace('{z}', t.z)
      .replace('{x}', t.x)
      .replace('{y}', t.y);

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        await saveCachedTile(key, blob, blob.type || 'image/png');
        successful++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }

    completed++;
    if (onProgress) {
      onProgress({
        completed,
        total,
        percent: Math.round((completed / total) * 100),
        currentZoom: t.z,
        status: 'downloading'
      });
    }

    // Polite pause to avoid hammering tile servers
    await new Promise((r) => setTimeout(r, 35));
  }

  return { total, successful, failed };
}

/**
 * Procedural tactical canvas tile renderer for areas without cached tiles when offline
 */
export function createOfflineGridTileCanvas(coords) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background light slate
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, 256, 256);

  // Border & Tactical Grid lines
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 256, 256);

  ctx.beginPath();
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.moveTo(128, 0); ctx.lineTo(128, 256);
  ctx.stroke();

  // Subtle label
  ctx.fillStyle = '#64748B';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`OFFLINE TACTICAL GRID`, 128, 115);
  ctx.fillText(`Z${coords.z} / ${coords.x},${coords.y}`, 128, 145);

  return canvas;
}

/**
 * Creates custom Leaflet TileLayer that checks IndexedDB first, then network, with offline canvas fallback
 */
export function createOfflineTileLayer(L, urlPattern, options = {}) {
  if (!L || !L.TileLayer) return null;

  const OfflineCapableTileLayer = L.TileLayer.extend({
    createTile: function(coords, done) {
      const tile = document.createElement('img');
      tile.setAttribute('role', 'presentation');
      tile.crossOrigin = 'anonymous';

      const key = `tile:${coords.z}/${coords.x}/${coords.y}`;

      // 1. Try IndexedDB cache first
      getCachedTile(key)
        .then((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            tile.src = objectUrl;
            tile.onload = () => {
              done(null, tile);
            };
            tile.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              done(null, tile);
            };
            return;
          }

          // 2. If online, fetch from remote tile server
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            const remoteUrl = this.getTileUrl(coords);
            tile.src = remoteUrl;
            tile.onload = () => {
              // Background save to IndexedDB cache
              fetch(remoteUrl, { mode: 'cors' })
                .then(res => res.blob())
                .then(newBlob => saveCachedTile(key, newBlob))
                .catch(() => {});
              done(null, tile);
            };
            tile.onerror = () => {
              try {
                const canvas = createOfflineGridTileCanvas(coords);
                if (canvas) tile.src = canvas.toDataURL('image/png');
              } catch (e) {}
              done(null, tile);
            };
          } else {
            // 3. Completely offline and not in cache: render fallback tactical grid into tile image
            try {
              const canvas = createOfflineGridTileCanvas(coords);
              if (canvas) tile.src = canvas.toDataURL('image/png');
            } catch (e) {}
            done(null, tile);
          }
        })
        .catch(() => {
          try {
            const canvas = createOfflineGridTileCanvas(coords);
            if (canvas) tile.src = canvas.toDataURL('image/png');
          } catch (e) {}
          done(null, tile);
        });

      return tile;
    }
  });

  return new OfflineCapableTileLayer(urlPattern, options);
}

export { getCachedTileStats, clearCachedTiles };
