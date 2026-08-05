# Offline Testing Checklist

## How to verify true offline operation

**Important**: These tests must be performed with actual network disabling, not merely mocking `navigator.onLine`. Use DevTools → Network → Offline, or enable Airplane Mode on a physical device.

---

## TEST A: Internet ON, GPS ON

1. Open app while online
2. Set HOME (use current location or search)
3. Download a 10km offline map area
4. Press GET ME HOME
5. **Expected**: GPS locates you, route calculates, map renders, turn-by-turn instructions appear
6. **Verify**: Route is calculated (check instruction bar shows distance + ETA)

## TEST B: Internet OFF, GPS ON

1. Open app while online, set HOME, download offline area
2. Disable internet (DevTools → Network → Offline, or Airplane Mode with GPS on)
3. Press GET ME HOME
4. **Expected**: "OFFLINE" badge shows. Route calculates using offline data. Map renders from stored data.
5. **Verify**: No network requests in DevTools Network tab during route calculation
6. **Verify**: Map still renders when panning to previously unseen parts of the region

## TEST C: Internet OFF, app restarted

1. Set HOME, download offline area, close app
2. Disable internet completely
3. Reopen app
4. Press GET ME HOME
5. **Expected**: App loads, HOME is preserved, offline map loads from IndexedDB, route calculates
6. **Verify**: No "cannot connect" errors; navigation works fully

## TEST D: Internet disappears during route

1. Start navigation while online
2. Mid-route, disable internet
3. **Expected**: Brief "INTERNET LOST" status, then "OFFLINE NAVIGATION ACTIVE"
4. **Verify**: Active route is NOT destroyed; navigation continues
5. **Verify**: Map continues rendering from offline data

## TEST E: User deviates from route offline

1. Start offline navigation
2. Move >50m away from the calculated route
3. **Expected**: After 3 consecutive off-route GPS reads, "RECALCULATING…" appears
4. **Verify**: New route is calculated WITHOUT any network request
5. **Verify**: New route appears on map, instructions update

## TEST F: GPS temporarily disappears

1. Start navigation
2. Disable GPS (or go indoors)
3. **Expected**: "GPS STALE" status appears after ~10 seconds
4. **Verify**: App does not crash; last known position remains on map
5. Re-enable GPS
6. **Verify**: Position updates resume, status returns to "GPS OK"

## TEST G: Current location outside offline coverage

1. Download a 10km area around HOME
2. Travel >10km away (or simulate coordinates outside the bbox)
3. Press GET ME HOME
4. **Expected**: "OFFLINE MAP DOESN'T COVER YOUR CURRENT LOCATION" warning
5. **Verify**: Emergency fallback screen shows: coordinates, distance to home, compass direction, share/copy/emergency buttons
6. **Verify**: App does NOT pretend road navigation is available

## TEST H: Storage nearly full

1. Fill device storage to near capacity
2. Attempt to download a 30km offline area
3. **Expected**: Download fails gracefully with an error message
4. **Verify**: App suggests a smaller region; no silent data corruption

## TEST I: Offline map package corrupted

1. Manually corrupt the IndexedDB region data (e.g., via DevTools → Application → IndexedDB)
2. Press GET ME HOME
3. **Expected**: Route calculation fails; app falls back to emergency screen
4. **Verify**: Compass + coordinates + share still work

## TEST J: HOME not configured

1. Delete HOME (or use fresh install)
2. Press GET ME HOME
3. **Expected**: Home setup screen appears
4. **Verify**: No navigation attempted without HOME

## TEST K: Browser/app reload during active navigation

1. Start navigation
2. Reload the page (or close + reopen the PWA)
3. **Expected**: Navigation state resets to idle; HOME and offline map preserved
4. **Verify**: Can press GET ME HOME again and resume navigation

---

## Key verification: No network during routing

For tests B, C, E — open DevTools → Network and check:
- **Zero** requests during route calculation
- **Zero** requests during map rendering
- **Zero** requests during rerouting

If any request appears during offline routing, the implementation is NOT complete.

## Key verification: Real GPS, not mocked

For device testing:
- Use a physical Android phone with Location Services enabled
- Walk/drive a short distance to verify position updates
- Verify heading arrow rotates when changing direction
- Verify off-route detection triggers when actually leaving the route
