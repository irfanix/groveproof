"""Downloads Sentinel-2 pictures from Microsoft Planetary Computer (free, no sign-up).

For each date window we:
  1. find scenes over the forest with less than 60% cloud,
  2. remove cloudy pixels using the Scene Classification Layer (SCL),
  3. take the median of the clear pixels -> one cloud-free picture (a "composite").

The exact scene ids are saved in the recipe, so a re-run downloads exactly
the same scenes again.
"""
from __future__ import annotations

import os

import numpy as np
from pyproj import Transformer
from rasterio.features import geometry_mask
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

from .analysis import BANDS, Composite

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
LOAD_THREADS = int(os.getenv("LOAD_THREADS", "16"))  # fewer on small free servers; pictures are read over the internet in parallel; this is the main speed-up
_rio_ready = False


def _fast_reads():
    """GDAL settings for reading cloud-optimised pictures quickly (fewer, bigger web requests)."""
    global _rio_ready
    if not _rio_ready:
        import odc.stac
        odc.stac.configure_rio(cloud_defaults=True)
        _rio_ready = True


def _client():
    import planetary_computer
    import pystac_client
    return pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)


def utm_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def find_scenes(geometry: dict, window: tuple[str, str], scfg: dict) -> list[str]:
    """Scene ids for a date window, sorted by date (oldest first), capped at max_scenes."""
    search = _client().search(
        collections=[scfg["collection"]],
        intersects=geometry,
        datetime=f"{window[0]}/{window[1]}",
        query={"eo:cloud_cover": {"lt": scfg["max_scene_cloud_pct"]}},
    )
    items = sorted(search.items(), key=lambda it: (it.datetime, it.id))
    # Prefer the clearest scenes, then keep date order for a stable recipe.
    best = sorted(items, key=lambda it: (it.properties.get("eo:cloud_cover", 100), it.id))[: scfg["max_scenes"]]
    return sorted(it.id for it in best)


def load_composite(geometry: dict, scene_ids: list[str], scfg: dict) -> tuple[Composite, np.ndarray]:
    """Download the given scenes and build the cloud-free median picture.

    Returns the composite and a true-colour RGB image (uint8) for display.
    """
    import odc.stac

    _fast_reads()
    geom = shape(geometry)
    c = geom.centroid
    epsg = utm_epsg(c.x, c.y)
    if not scene_ids:
        raise ValueError("No satellite scenes found for these dates")

    items = list(_client().search(collections=[scfg["collection"]], ids=scene_ids).items())
    found = {it.id for it in items}
    missing = set(scene_ids) - found
    if missing:
        raise RuntimeError(f"Scenes no longer available: {sorted(missing)}")
    items.sort(key=lambda it: it.id)

    for it in items:
        baseline = str(it.properties.get("s2:processing_baseline", "00.00"))
        if baseline < "04.00":
            # Older scenes have no 1000 offset. We keep the rule simple and refuse to mix.
            raise RuntimeError(f"Scene {it.id} uses processing baseline {baseline}; use dates from 2022 on")

    ds = odc.stac.load(
        items,
        bands=BANDS + ["SCL"],
        crs=f"EPSG:{epsg}",
        resolution=scfg["resolution_m"],
        bbox=geom.bounds,
        groupby="solar_day",
        resampling={"SCL": "nearest", "*": "bilinear"},
        pool=LOAD_THREADS,
    )

    scl = ds["SCL"].values  # (time, rows, cols)
    clear = np.isin(scl, scfg["clear_scl_classes"])
    bands = {}
    for b in BANDS:
        dn = ds[b].values.astype("float32")
        refl = (dn - 1000.0) / 10000.0  # baseline 04.00+ offset
        refl[(dn == 0) | ~clear] = np.nan
        with np.errstate(all="ignore"):
            bands[b] = np.nanmedian(refl, axis=0)

    # Boundary as a pixel mask
    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform
    geom_utm = shp_transform(to_utm, geom)
    transform = ds.odc.geobox.affine
    rows, cols = bands["B02"].shape
    aoi = geometry_mask([mapping(geom_utm)], out_shape=(rows, cols), transform=transform, invert=True)

    rgb = true_colour(bands)
    return Composite(bands=bands, aoi=aoi, pixel_area_ha=(scfg["resolution_m"] ** 2) / 10000.0,
                     scene_ids=sorted(scene_ids)), rgb


def true_colour(bands: dict) -> np.ndarray:
    """Simple true-colour picture (red, green, blue) brightened for display."""
    rgb = np.stack([bands["B04"], bands["B03"], bands["B02"]], axis=-1)
    rgb = np.clip(np.nan_to_num(rgb, nan=0.0) / 0.25, 0, 1) ** (1 / 1.6)
    return (rgb * 255).astype("uint8")
