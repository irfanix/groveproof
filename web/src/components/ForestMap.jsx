// Map of the forest. Shows sample forests, lets the user draw a boundary,
// and overlays the H3 hexagons (map cells) that the contract will store.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import MapSearch from "./MapSearch";

const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export default function ForestMap({ samples = [], selectedId, onSelectSample, onDraw, boundary, cells, claimedCells = [] }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([16.117, 78.778], 13);
    L.tileLayer(SATELLITE, { maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(m);
    layers.current.samples = L.layerGroup().addTo(m);
    layers.current.drawn = new L.FeatureGroup().addTo(m);
    layers.current.cells = L.layerGroup().addTo(m);

    const draw = new L.Control.Draw({
      draw: { polygon: { shapeOptions: { color: "#7FC29B", weight: 3 } }, rectangle: { showArea: false, shapeOptions: { color: "#7FC29B", weight: 3 } }, // showArea off: leaflet-draw has a bug ("type is not defined") in its area label
              polyline: false, circle: false, marker: false, circlemarker: false },
      edit: { featureGroup: layers.current.drawn, edit: false, remove: true },
    });
    m.addControl(draw);
    m.on(L.Draw.Event.CREATED, (e) => {
      layers.current.drawn.clearLayers();
      layers.current.drawn.addLayer(e.layer);
      onDraw?.(e.layer.toGeoJSON().geometry);
    });
    m.on(L.Draw.Event.DELETED, () => onDraw?.(null));
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sample forests
  useEffect(() => {
    const g = layers.current.samples;
    if (!g) return;
    g.clearLayers();
    samples.forEach((s) => {
      const selected = s.id === selectedId;
      const layer = L.geoJSON(s.boundary, {
        style: { color: selected ? "#FFFFFF" : "#7FC29B", weight: selected ? 4 : 2, dashArray: selected ? null : "6 6", fillOpacity: selected ? 0.12 : 0.04 },
      });
      layer.bindTooltip(s.name, { sticky: true });
      layer.on("click", () => onSelectSample?.(s.id));
      g.addLayer(layer);
    });
  }, [samples, selectedId, onSelectSample]);

  // zoom to the chosen boundary
  useEffect(() => {
    if (!boundary || !map.current) return;
    const b = L.geoJSON(boundary).getBounds();
    map.current.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    if (selectedId) layers.current.drawn.clearLayers();
  }, [boundary, selectedId]);

  // H3 hexagons
  useEffect(() => {
    const g = layers.current.cells;
    if (!g) return;
    g.clearLayers();
    if (!cells?.features) return;
    const claimed = new Set(claimedCells);
    L.geoJSON(cells, {
      style: (f) => claimed.has(f.properties.cell)
        ? { color: "#2F55A4", weight: 2, fillColor: "#2F55A4", fillOpacity: 0.45 }
        : { color: "#FFFFFF", weight: 1, fillOpacity: 0 },
    }).addTo(g);
  }, [cells, claimedCells]);

  function goTo({ lat, lon, bounds }) {
    const m = map.current;
    if (!m) return;
    if (bounds) m.flyToBounds(bounds, { maxZoom: 14, duration: 1.2 });
    else m.flyTo([lat, lon], 14, { duration: 1.2 });
  }

  return (
    <div className="relative w-full h-full min-h-[320px]">
      <div ref={el} className="w-full h-full min-h-[320px] rounded-2xl overflow-hidden" aria-label="Map of the forest" />
      <MapSearch onGo={goTo} />
    </div>
  );
}
