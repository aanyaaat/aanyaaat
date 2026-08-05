# Offline Map Generation

## How offline map packages are generated

Unlike traditional offline map apps that download pre-rendered raster tiles, GET ME HOME fetches **raw OpenStreetMap vector data** from the Overpass API and builds a compact road + routing graph locally in the browser.

## Process

### 1. User configures HOME
The user sets their home location (via GPS, search, or manual coordinates). This is stored in `localStorage`.

### 2. User selects a safety area radius
Presets: 5 km, 10 km, 20 km, 30 km. The estimated storage size is shown before download.

### 3. Bounding box calculation
```
deg = radiusKm / 111 + 0.01  (1° latitude ≈ 111 km)
bbox = [centerLat - deg, centerLng - deg, centerLat + deg, centerLng + deg]
```

### 4. Overpass API query
The app sends a single POST request to `overpass-api.de` (with fallback to `overpass.kumi.systems`):

```overpassql
[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|footway|path|cycleway|pedestrian|track)$"](bbox);
  node["amenity"="hospital"](bbox);
  node["amenity"="police"](bbox);
  node["railway"="station"](bbox);
  node["railway"="subway_entrance"](bbox);
  node["public_transport"="station"](bbox);
  way["amenity"="hospital"](bbox);
  way["amenity"="police"](bbox);
  way["railway"="station"](bbox);
);
out body geom;
```

This fetches:
- All roads in the specified highway classes
- Hospitals, police stations, railway/metro stations
- NOT: restaurants, shops, reviews, indoor maps, satellite imagery, decorative POIs

### 5. Parsing
The JSON response is parsed into:
- `nodes`: Map<id, [lat, lng]> — road intersection points
- `edges`: [fromId, toId, roadClass, name] — directed road segments (bidirectional unless oneway)
- `roads`: GeoJsonRoad[] — LineStrings for canvas rendering
- `pois`: Poi[] — hospitals, police, stations

### 6. Storage
The parsed region is stored in IndexedDB (`aanyaa_nav` database). After this, no network access is needed for navigation.

## Manual generation (advanced)

If you want to generate a region offline using local OSM data instead of Overpass:

### Prerequisites
- `osmium-tool` or `osmosis` for OSM data processing
- A `.osm.pbf` file for your region (from Geofabrik or BBBike)

### Steps
```bash
# 1. Download OSM extract for your region
wget https://download.geofabrik.de/your-region-latest.osm.pbf

# 2. Filter to roads + amenities
osmium tags-filter your-region-latest.osm.pbf \
  w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,living_street,service,footway,path,cycleway,pedestrian,track \
  n/amenity=hospital,police \
  n/railway=station,subway_entrance \
  -o filtered.osm

# 3. Convert to JSON with geometry
osmium export filtered.osm -o filtered.geojson --geometry-type=linestring --add-unique-id=type_id

# 4. Import into the app
# (Use the "Add model file" flow or a custom script to load filtered.geojson into IndexedDB)
```

## Licensing

- OSM data is licensed under the Open Database License (ODbL)
- Attribution required: "© OpenStreetMap contributors"
- The app displays this attribution on the map screen and in the About panel
- Overpass API usage policy: small bounding boxes, infrequent requests — respected by the 30km max radius and single-request design
