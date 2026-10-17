"""Turns a forest boundary into H3 map cells.

H3 is a world-wide grid of hexagons. At resolution 9 each hexagon is about
0.1 km2. The contract stores which project owns each hexagon, so two
projects can never claim the same land ("Already claimed").
"""
from __future__ import annotations

import h3
from shapely.geometry import shape, mapping


def boundary_to_cells(geometry: dict, resolution: int = 9) -> list[int]:
    """Return the sorted H3 cell ids (as integers) whose centre lies inside the boundary.

    Very small boundaries that contain no cell centre get the single cell under their centre,
    so every project claims at least one cell.
    """
    geom = shape(geometry)
    if geom.is_empty or not geom.is_valid:
        raise ValueError("The boundary is empty or not a valid polygon")
    cells = set(h3.geo_to_cells(mapping(geom), resolution))
    if not cells:
        c = geom.centroid
        cells = {h3.latlng_to_cell(c.y, c.x, resolution)}
    return sorted(h3.str_to_int(c) for c in cells)


def cells_to_strings(cells: list[int]) -> list[str]:
    """Integer ids as decimal strings (safe for JavaScript, which loses precision above 2^53)."""
    return [str(c) for c in cells]


def cells_geojson(cells: list[int]) -> dict:
    """The hexagons as a GeoJSON FeatureCollection, for drawing on the map."""
    feats = []
    for c in cells:
        boundary = h3.cell_to_boundary(h3.int_to_str(c))  # (lat, lng) pairs
        ring = [[lng, lat] for lat, lng in boundary] + [[boundary[0][1], boundary[0][0]]]
        feats.append({"type": "Feature", "properties": {"cell": str(c)},
                      "geometry": {"type": "Polygon", "coordinates": [ring]}})
    return {"type": "FeatureCollection", "features": feats}
