// "How we calculated this": the formulas with the real numbers filled in.
export default function HowCalculated({ payload }) {
  const r = payload.result;
  const n = r.numbers;
  const c = r.credits;
  if (r.verdict === "AlreadyClaimed") return null;
  const pct = (x) => `${Math.round(x * 100)}%`;
  return (
    <details className="panel p-5 group">
      <summary className="cursor-pointer font-display font-bold text-lg list-none flex items-center justify-between">
        How we calculated this <span className="muted group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="mt-4 space-y-4 leading-relaxed">
        <div>
          <h3 className="font-bold">1. What the satellites saw</h3>
          <p className="muted">Sentinel-2 pictures (10 m pixels). Cloudy pixels removed with the Scene Classification Layer, then the median of the clear pixels. Only land clear in both pictures is compared.</p>
          <p id="proof-clear" className="mono rounded-lg px-1 -mx-1">Area {n.area_ha} ha, seen clearly {n.clear_pct}%, scenes before {payload.scenes?.before?.length ?? "–"}, after {payload.scenes?.after?.length ?? "–"}</p>
        </div>
        <div>
          <h3 className="font-bold">2. Forest map</h3>
          <p className="muted">
            {n.method === "random_forest"
              ? `A Random Forest model (${payload.model?.version}) labels each pixel as forest or not, using 6 colour bands plus NDVI and NDMI.`
              : "Pixels with NDVI = (NIR − Red) / (NIR + Red) of 0.6 or more count as forest."}
            {" "}Tree loss = forest before, not forest after, and greenness (NDVI) dropped by at least 0.1.
          </p>
          <p id="proof-forest" className="mono rounded-lg px-1 -mx-1">Forest before {n.forest_before_ha} ha → after {n.forest_after_ha} ha, loss {n.loss_ha} ha ({n.loss_pct}%), unsure pixels {n.low_confidence_pct}%</p>
        </div>
        {r.verdict === "Verified" && (
          <div>
            <h3 className="font-bold">3. Credits (code only, no AI)</h3>
            <p id="proof-credits" className="mono text-sm bg-white border border-line rounded-xl p-3 overflow-x-auto">
              CO₂ per year = {c.forest_ha_used} ha × {c.growth_t_dm_per_ha_yr} t growth × (1 + {c.root_shoot_ratio} roots) × {c.carbon_fraction} carbon × 44/12 = <b>{c.annual_co2_t} t</b><br />
              Credits = {c.annual_co2_t} × (1 − {pct(c.uncertainty_deduction)} uncertainty) × (1 − {pct(c.buffer_share)} buffer) = <b>{c.credits}</b>
            </p>
            <p className="muted text-sm mt-2">
              Factors: IPCC default values for “{c.zone_label}”. This is a demo method, not an official carbon standard.
              {!c.factors_verified && " These factor values are still being checked against the IPCC document."}
            </p>
          </div>
        )}
        <div>
          <h3 className="font-bold">Proof</h3>
          <p className="muted text-sm">Recipe hash (every input and rule): <span className="mono break-all">{payload.recipe_hash}</span></p>
          <p className="muted text-sm">Result hash: <span className="mono break-all">{payload.result_hash}</span></p>
        </div>
      </div>
    </details>
  );
}
