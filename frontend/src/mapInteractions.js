// TMAP V2's polygon click is not consistently synthesized for touch on mobile.
// Observe native touches without cancelling the SDK's pan/pinch gestures.
export function observeMapTaps(element, onTap, clock = () => performance.now()) {
  let gesture = null;
  let ignoreClickUntil = 0;
  const start = event => {
    if (event.touches.length !== 1) {
      if (gesture) gesture.cancelled = true;
      ignoreClickUntil = clock() + 800;
      return;
    }
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: clock(), cancelled: false };
  };
  const move = event => {
    if (!gesture) return;
    const touch = Array.from(event.touches).find(item => item.identifier === gesture.id);
    if (event.touches.length !== 1 || !touch || Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 10) gesture.cancelled = true;
  };
  const cancel = () => { gesture = null; ignoreClickUntil = clock() + 800; };
  const end = event => {
    if (!gesture) return;
    const current = gesture;
    // Keep a cancelled multi-touch gesture cancelled until every finger has lifted.
    if (event.touches.length) { current.cancelled = true; return; }
    gesture = null;
    ignoreClickUntil = clock() + 800;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === current.id);
    if (!touch || current.cancelled || clock() - current.at > 650 || Math.hypot(touch.clientX - current.x, touch.clientY - current.y) > 10) return;
    if (event.target?.closest?.('button, a, input, [role="button"]')) return;
    onTap({ clientX: touch.clientX, clientY: touch.clientY });
  };
  const listeners = { touchstart: start, touchmove: move, touchend: end, touchcancel: cancel };
  const options = { capture: true, passive: true };
  Object.entries(listeners).forEach(([name, fn]) => element.addEventListener(name, fn, options));
  return {
    ignoreSyntheticClick: () => clock() < ignoreClickUntil || Boolean(gesture),
    dispose: () => Object.entries(listeners).forEach(([name, fn]) => element.removeEventListener(name, fn, options)),
  };
}

export function readLatLng(value) {
  if (!value) return null;
  const lat = Number(typeof value.lat === 'function' ? value.lat() : value.lat ?? value._lat);
  const lng = Number(typeof value.lng === 'function' ? value.lng() : value.lng ?? value._lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// Map V2 is a north-up Web Mercator map. Interpolate projected Y, not latitude.
export function touchToPosition(map, element, point) {
  if (!Number.isFinite(point?.clientX) || !Number.isFinite(point?.clientY)) return null;
  const bounds = map?.getBounds?.();
  const northEast = readLatLng(bounds?.getNorthEast?.());
  const southWest = readLatLng(bounds?.getSouthWest?.());
  const rect = element.getBoundingClientRect();
  if (!northEast || !southWest || rect.width <= 0 || rect.height <= 0) return null;
  const x = (point.clientX - rect.left) / rect.width;
  const y = (point.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const mercator = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI / 360));
  const north = mercator(northEast.lat), south = mercator(southWest.lat);
  const lat = (2 * Math.atan(Math.exp(north + (south - north) * y)) - Math.PI / 2) * 180 / Math.PI;
  let span = northEast.lng - southWest.lng;
  if (span < 0) span += 360;
  let lng = southWest.lng + span * x;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}

export const zoneAtPosition = (zones, point) => point && zones.find(zone =>
  point.lat >= Number(zone.min_lat) && point.lat < Number(zone.max_lat) &&
  point.lng >= Number(zone.min_lng) && point.lng < Number(zone.max_lng));
