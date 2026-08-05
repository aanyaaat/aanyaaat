# Map & Routing Licenses

## Dependencies

| Library / Service | Version | License | Usage |
|---|---|---|---|
| Custom Canvas Renderer | — | MIT (project license) | Map rendering |
| Custom A* Router | — | MIT (project license) | Offline routing |
| Web Mercator Projection | — | Public domain (math) | Coordinate projection |

No external mapping/routing libraries are bundled. The renderer and router are custom-built within this project.

## Data Sources

### OpenStreetMap (OSM)
- **License**: Open Database License (ODbL) — https://www.openstreetmap.org/copyright
- **Required attribution**: "© OpenStreetMap contributors"
- **Usage**: Road network, POIs (hospitals, police, stations)
- **Offline redistribution**: ODbL permits redistribution of derived data provided attribution is maintained. The app displays attribution on the map screen and in documentation.

### Overpass API
- **Endpoint**: `overpass-api.de` (with fallback: `overpass.kumi.systems`)
- **License**: Output data is ODbL (same as OSM)
- **Usage policy**: Small bounding boxes, infrequent requests, reasonable timeout
- **URL**: https://wiki.openstreetmap.org/wiki/Overpass_API

### Nominatim (geocoding, online only)
- **Endpoint**: `nominatim.openstreetmap.org`
- **License**: Output data is ODbL
- **Usage policy**: Max 1 request per second, valid Referer/User-Agent
- **Usage**: Location search during HOME setup (online only, not required for navigation)
- **URL**: https://nominatim.openstreetmap.org/

### OSRM (online routing, enhancement only)
- **Endpoint**: `routing.openstreetmap.de`
- **License**: OSRM is MIT-licensed; routing data is ODbL
- **Usage**: Optional online routing enhancement; app does NOT depend on it
- **URL**: https://project-osrm.org/

## What is NOT used

- Google Maps API (paid, not used)
- Mapbox (paid, not used)
- MapLibre (not bundled — custom renderer instead)
- PMTiles (not used — no tile generation needed)
- `tile.openstreetmap.org` raster tiles (NOT scraped — policy compliance)
- `vector.openstreetmap.org` vector tiles (NOT scraped — policy compliance)
- Any paid routing API
- Any paid geocoding API
- Any cloud storage of user data

## Attribution Display

The app displays "© OpenStreetMap contributors" in:
- The map screen (bottom-right corner, always visible during navigation)
- This document
- The architecture document

## Privacy Compliance

- No user coordinates are sent to any server for storage
- Overpass/Nominatim requests are made only during online setup/download
- After offline map installation, no network requests are needed for navigation
- HOME coordinates are stored in `localStorage` only
- GPS history is not permanently stored
- No analytics or tracking services are integrated
