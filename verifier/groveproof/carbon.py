"""Credit calculation. Code only, never a language model.

annual CO2 (t) = forest area (ha) x growth (t dry matter/ha/yr) x (1 + root:shoot)
                 x carbon fraction x 44/12
credits        = floor( annual CO2 x (1 - uncertainty deduction) x (1 - buffer share) )

1 credit = 1 tonne of CO2. This is a demo method based on IPCC default
factors, not an official carbon standard.
"""
from __future__ import annotations

import math


def uncertainty_deduction(numbers: dict, ccfg: dict) -> float:
    """'When unsure, credit less': start at 20% and add more when the evidence is weaker."""
    d = ccfg["base_uncertainty_deduction"]
    if numbers["clear_pct"] < 90:
        d += ccfg["extra_deduction_if_clear_below_90"]
    if numbers["low_confidence_pct"] > 10:
        d += ccfg["extra_deduction_if_low_conf_above_10"]
    return round(min(d, ccfg["max_uncertainty_deduction"]), 4)


def compute_credits(verdict: str, numbers: dict, ccfg: dict, factors: dict, zone: str | None = None) -> dict:
    zone = zone or factors["default_zone"]
    z = factors["zones"][zone]
    cf = factors["carbon_fraction"]["value"]
    co2_per_c = factors["co2_per_c"]["value"]

    area = numbers["forest_after_ha"]
    annual_co2 = area * z["growth_t_dm_per_ha_yr"] * (1 + z["root_shoot_ratio"]) * cf * co2_per_c
    u = uncertainty_deduction(numbers, ccfg)
    b = ccfg["buffer_share"]
    credits = math.floor(annual_co2 * (1 - u) * (1 - b)) if verdict == "Verified" else 0

    return {
        "zone": zone,
        "zone_label": z["label"],
        "forest_ha_used": area,
        "growth_t_dm_per_ha_yr": z["growth_t_dm_per_ha_yr"],
        "root_shoot_ratio": z["root_shoot_ratio"],
        "carbon_fraction": cf,
        "annual_co2_t": round(annual_co2, 2),
        "uncertainty_deduction": u,
        "buffer_share": b,
        "credits": credits,
        "factors_verified": bool(factors.get("verified", False)),
    }
