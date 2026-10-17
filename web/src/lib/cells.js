// H3 map cells in the browser, only for drawing the hexagons on the map.
// The official cell list always comes from the verifier, which uses the same H3 library.
import { polygonToCells, cellToBoundary } from "h3-js";

export function cellsGeoJSON(boundary, res = 9) {
  if (!boundary) return null;
  const rings = boundary.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
  const ids = polygonToCells(rings, res);
  return {
    type: "FeatureCollection",
    count: ids.length,
    features: ids.map((h) => {
      const ring = cellToBoundary(h).map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      return { type: "Feature", properties: { cell: BigInt("0x" + h).toString() }, geometry: { type: "Polygon", coordinates: [ring] } };
    }),
  };
}
