# GET ME HOME — Architecture

## Overview

GET ME HOME is a privacy-first, zero-recurring-cost offline navigation system integrated into the Aanyaa offline AI companion. It provides emergency fallback navigation toward a user-configured HOME location, working entirely without internet after initial setup.

## Map Source

- **Data**: OpenStreetMap (ODbL licensed)
- **Fetch method**: Overpass API (`overpass-api.de`) — the legitimate bulk-download endpoint for OSM data
- **What's fetched**: highways (motorway through footway), hospitals, police stations, railway/metro stations, public transport stations
- **What's NOT fetched**: restaurants, shops, reviews, indoor maps, satellite imagery, 3D buildings, decorative POIs
- **No tiles scraped**: We never request from `tile.openstreetmap.org` or `vector.openstreetmap.org`. Overpass returns raw OSM data, not rendered tiles.

## Map Renderer

- **Custom canvas renderer** (`CanvasMap.tsx`) — no MapLibre/Mapbox dependency
- Renders roads as styled lines (width/color by road class), POIs as colored dots, route as blue line, user position with accuracy circle + heading arrow, home as marker
- Web Mercator projection (`projection.ts`)
- Pan via pointer drag, zoom via wheel/pinch
- Auto-centers on GPS when user hasn't manually panned; RECENTER button re-centers

**Why not MapLibre?** MapLibre requires vector tiles (PMTiles). Generating PMTiles requires `tippecanoe` (C++ server tool) — impossible in a browser-only PWA. Pre-built PMTiles would need hosting (recurring cost/server). A custom canvas renderer adds 0 KB of dependencies, works fully offline, and gives full control over what's rendered.

## Routing Engine

- **Custom A* over OSM-derived road graph** (`astar.ts`, `graph.ts`)
- No GraphHopper/Valhalla/OSRM server dependency (those are JVM/C++ server engines, unsuitable for browser PWA)
- Graph: adjacency list from OSM ways, nodes indexed by ID, edges weighted by distance / road-class speed factor
- Heuristic: haversine distance (admissible for geographic routing)
- Turn-by-turn: derived from road name changes + bearing delta between consecutive segments
- Travel modes: walk (5 km/h), drive (40 km/h), bike (15 km/h)
- Route calculation: typically <100ms for a 10km region on a phone

**Online routing** (enhancement only): OSRM public demo server (`routing.openstreetmap.de`). If it fails, offline router takes over seamlessly.

## Offline Data Format

```
OfflineRegion {
  nodes: Record<id, [lat, lng]>      // road intersection nodes
  edges: [fromId, toId, class, name] // directed road segments
  roads: GeoJsonRoad[]               // LineStrings for rendering
  pois: Poi[]                        // hospitals, police, stations
  sizeBytes: number                  // actual measured size
}
```

Stored in IndexedDB (`aanyaa_nav` database, `regions` store). Home coordinates stored in `localStorage` (tiny, must survive resets).

## Storage

- Home location: `localStorage` (~100 bytes)
- Offline region: IndexedDB (typically 1–5 MB for 10km, varies by road density)
- No GPS history permanently stored
- No movement tracking
- DELETE ALL NAVIGATION DATA: removes home + offline region + all nav data

## GPS

- `navigator.geolocation.watchPosition` with high accuracy
- Status tracking: idle, locating, found, weak (>50m accuracy), stale (>10s since last fix), denied, unavailable
- Never pretends location is accurate when it isn't
- Handles permission denied, GPS unavailable, low accuracy, temporary loss

## Rerouting

- Off-route detection: distance from GPS to nearest route point > 50m for 3 consecutive reads
- When triggered: recalculates route from current position to HOME using offline graph
- No reroute on tiny GPS fluctuations (persistence check prevents jitter)

## Privacy

- HOME coordinates: stored in `localStorage`, never sent to any server
- GPS history: not permanently stored
- No analytics, no tracking, no cloud storage of home
- No console logging of coordinates in production
- No URL query parameters containing HOME
- Overpass/Nominatim requests: only made while online, for initial setup/download

## Online/Offline Switching

- `navigator.onLine` + `online`/`offline` events tracked
- Online: tries OSRM first, falls back to offline router
- Offline: uses offline router exclusively
- If internet disappears during route: shows "INTERNET LOST — Switching to saved navigation", continues with offline data
- If internet returns: shows "INTERNET RESTORED", does not destroy active offline route

## Coverage Check

- Before offline routing, checks if both current GPS and HOME are within the installed region's bbox
- If outside: shows "OFFLINE MAP DOESN'T COVER YOUR CURRENT LOCATION" + emergency fallback (coordinates, compass, share, copy, emergency call)

## File Structure

```
src/navigation/
  domain/types.ts          — nav domain types
  storage/homeStorage.ts   — home location (localStorage)
  offline/regions.ts        — IndexedDB region storage + install
  offline/overpass.ts       — OSM data fetch + parse
  gps/gps.ts               — geolocation wrapper + geo math
  maps/projection.ts       — Web Mercator projection
  maps/CanvasMap.tsx        — canvas map renderer
  routing/graph.ts          — OSM → road graph
  routing/astar.ts          — A* offline router
  routing/onlineRouter.ts   — OSRM online router (enhancement)
  state/NavStore.tsx        — navigation state context
  ui/GetMeHomeButton.tsx    — prominent entry button
  ui/HomeSetup.tsx          — set/change/delete home
  ui/NavigationScreen.tsx   — live navigation UI
  ui/OfflineMapsPanel.tsx   — package management
  ui/CompassFallback.tsx    — bearing-to-home compass
  ui/EmergencyFallback.tsx  — coordinates + share + emergency
```
