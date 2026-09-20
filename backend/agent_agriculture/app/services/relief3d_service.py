"""3D relief payload builder: LiDAR elevation + Sentinel NDVI/NDWI + slope stats."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO

import httpx
import numpy as np
import tifffile
from pyproj import Geod
from shapely import contains_xy
from shapely.geometry import shape

from app.config import settings
from app.services.elevation_ign import recuperer_elevations
from app.services.lidar_hd import recuperer_mnt_lidar_hd
from app.services.orthophoto_ign import recuperer_orthophoto_ign
from app.services import satellite_service

_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

_EVALSCRIPT_INDICES = """
//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "SCL", "dataMask"],
    output: { bands: 4, sampleType: "FLOAT32" }
  };
}

function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-6);
  // McFeeters NDWI: surface water indicator (Green / NIR).
  let ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08 + 1e-6);
  // Gao NDMI: canopy/vegetation moisture indicator (NIR / SWIR).
  let ndmi = (sample.B08 - sample.B11) / (sample.B08 + sample.B11 + 1e-6);
  // Reject both no-data/saturated pixels and the SCL classes which do not
  // represent a clear land observation.  Leaving SCL 0 or 1 in the grid can
  // create plausible-looking, but completely artificial, index values.
  let valid = sample.dataMask === 1 && ![0, 1, 3, 8, 9, 10, 11].includes(sample.SCL) ? 1.0 : 0.0;
  return [ndvi, ndwi, ndmi, valid];
}
"""


def relief_ign_secours(bounds: tuple[float, float, float, float]) -> dict:
    """Fallback relief using IGN elevation API when LiDAR cannot be fetched."""
    min_lon, min_lat, max_lon, max_lat = bounds
    geod = Geod(ellps="WGS84")
    _, _, width_m = geod.inv(min_lon, min_lat, max_lon, min_lat)
    _, _, height_m = geod.inv(min_lon, min_lat, min_lon, max_lat)

    # This is a fast visual fallback, not a replacement for LiDAR.  A 25×25
    # grid keeps the public IGN API call bounded when LiDAR is unavailable.
    pixel_m = max(1.0, max(width_m, height_m) / 24)
    width = max(2, int(np.ceil(width_m / pixel_m)) + 1)
    height = max(2, int(np.ceil(height_m / pixel_m)) + 1)

    lons = np.linspace(min_lon, max_lon, width)
    lats = np.linspace(max_lat, min_lat, height)

    lons_flat = np.repeat(lons[np.newaxis, :], height, axis=0).ravel()
    lats_flat = np.repeat(lats[:, np.newaxis], width, axis=1).ravel()

    elevations = recuperer_elevations(lons_flat.tolist(), lats_flat.tolist())
    if len(elevations) != width * height:
        raise RuntimeError("IGN elevation service did not return all requested points.")

    elevation = np.asarray(elevations, dtype=float).reshape((height, width))
    if not np.isfinite(elevation).any():
        raise RuntimeError("No usable IGN elevations on this parcel.")

    return {
        "elevation": elevation,
        "validite": np.isfinite(elevation),
        "largeur_m": width_m,
        "hauteur_m": height_m,
        "resolution_m": round(max(width_m / (width - 1), height_m / (height - 1)), 1),
        "date_acquisition": None,
        "source": "IGN RGE ALTI fallback (LiDAR unavailable)",
    }


async def _fetch_indices_grid(geometry: dict, width: int, height: int, days_back: int = 30) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Fetch cloud-masked Sentinel-2 NDVI, NDWI and NDMI rasters."""
    if not settings.sentinel_hub_client_id or not settings.sentinel_hub_client_secret:
        raise LookupError("Sentinel credentials are missing in backend environment.")

    token = await satellite_service._get_access_token()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)

    payload = {
        "input": {
            "bounds": {
                "geometry": geometry,
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "to": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        },
                        "mosaickingOrder": "leastCC",
                        "maxCloudCoverage": 80,
                    },
                }
            ],
        },
        "output": {
            "width": int(width),
            "height": int(height),
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
        },
        "evalscript": _EVALSCRIPT_INDICES,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            _PROCESS_URL,
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        response.raise_for_status()

    arr = tifffile.imread(BytesIO(response.content)).astype(np.float32)
    if arr.ndim != 3 or arr.shape[2] < 4:
        raise RuntimeError("Unexpected Sentinel raster format for NDVI/NDWI/NDMI.")

    ndvi = arr[:, :, 0]
    ndwi = arr[:, :, 1]
    ndmi = arr[:, :, 2]
    valid = (arr[:, :, 3] > 0.5) & np.isfinite(ndvi) & np.isfinite(ndwi) & np.isfinite(ndmi)
    return ndvi, ndwi, ndmi, valid


async def build_relief_grid(geometry_geojson: dict, max_dimension: int = 128) -> dict:
    """Build the JSON payload consumed by the Three.js terrain view."""
    parcel = shape(geometry_geojson)
    min_lon, min_lat, max_lon, max_lat = parcel.bounds

    warnings: list[str] = []

    try:
        lidar = await asyncio.to_thread(recuperer_mnt_lidar_hd, geometry_geojson, max_dimension=max_dimension)
    except Exception:  # LiDAR coverage and IGN availability must not block the viewer.
        lidar = await asyncio.to_thread(relief_ign_secours, (min_lon, min_lat, max_lon, max_lat))
        warnings.append("LiDAR unavailable, using IGN elevation fallback.")

    elevation = lidar["elevation"]
    valid_elev = lidar["validite"].astype(bool)
    height, width = elevation.shape

    # The source rasters cover the footprint's bounding box.  Keep only cells
    # whose centers are inside the actual GeoJSON parcel, so neither terrain
    # nor indicator colours suggest data outside the selected field.
    grid_lons, grid_lats = np.meshgrid(
        np.linspace(min_lon, max_lon, width),
        np.linspace(max_lat, min_lat, height),
    )
    # ``contains`` deliberately excludes a polygon's boundary.  Raster grid
    # vertices commonly lie exactly on that boundary, which used to remove the
    # outside row/column of every parcel (and could remove an entire narrow
    # parcel).  A sub-millimetre geographic buffer only makes the mask
    # boundary-inclusive; it does not extend the displayed field in practice.
    parcel_mask = contains_xy(parcel.buffer(1e-10), grid_lons, grid_lats)
    valid_terrain = valid_elev & parcel_mask
    satellite_available = False
    valid_satellite = np.zeros_like(valid_terrain, dtype=bool)
    ndvi = np.zeros_like(elevation, dtype=np.float32)
    ndwi = np.zeros_like(elevation, dtype=np.float32)
    ndmi = np.zeros_like(elevation, dtype=np.float32)

    try:
        ndvi_raw, ndwi_raw, ndmi_raw, valid_sat = await _fetch_indices_grid(geometry_geojson, width=width, height=height, days_back=30)
        valid_satellite = valid_sat & valid_terrain
        if not valid_satellite.any():
            warnings.append("No cloud-free Sentinel-2 pixel is available on this parcel; vegetation indices are disabled.")
        else:
            satellite_available = True
            # Values in cloudy/nodata cells are never used for stats.  They are
            # shown in neutral grey by the frontend instead of fabricated data.
            ndvi = ndvi_raw
            ndwi = ndwi_raw
            ndmi = ndmi_raw
    except Exception as exc:  # noqa: BLE001
        warnings.append(f"Sentinel-2 indices unavailable: {exc}")

    step_x = lidar["largeur_m"] / max(width - 1, 1)
    step_y = lidar["hauteur_m"] / max(height - 1, 1)
    dy, dx = np.gradient(elevation, step_y, step_x)
    slope_pct = np.hypot(dx, dy) * 100.0
    slope_valid = slope_pct[valid_terrain]
    ndvi_valid = ndvi[valid_satellite]
    ndwi_valid = ndwi[valid_satellite]
    ndmi_valid = ndmi[valid_satellite]

    return {
        "grille_ndvi": ndvi.tolist(),
        "grille_ndwi": ndwi.tolist(),
        "grille_ndmi": ndmi.tolist(),
        "grille_elevation": elevation.tolist(),
        "grille_pente_pct": slope_pct.tolist(),
        "grille_validite": valid_terrain.tolist(),
        "grille_validite_satellite": valid_satellite.tolist(),
        "hauteur": int(height),
        "largeur": int(width),
        "largeur_m": round(float(lidar["largeur_m"]), 1),
        "hauteur_m": round(float(lidar["hauteur_m"]), 1),
        "resolution_relief_m": lidar["resolution_m"],
        # B03/B04/B08 are native 10 m Sentinel-2 bands. B11 and the cloud
        # classification layer are native 20 m, so a denser display grid does
        # not create extra satellite detail for NDMI or the quality mask.
        "resolution_satellite_m": 10,
        "resolution_ndmi_m": 20,
        "source_relief": lidar["source"],
        "date_relief": lidar["date_acquisition"],
        "stats_ndvi": {
            "moyen": round(float(np.mean(ndvi_valid)), 3) if ndvi_valid.size else None,
            "min": round(float(np.min(ndvi_valid)), 3) if ndvi_valid.size else None,
            "max": round(float(np.max(ndvi_valid)), 3) if ndvi_valid.size else None,
            "ndwi_moyen": round(float(np.mean(ndwi_valid)), 3) if ndwi_valid.size else None,
            "ndwi_min": round(float(np.min(ndwi_valid)), 3) if ndwi_valid.size else None,
            "ndwi_max": round(float(np.max(ndwi_valid)), 3) if ndwi_valid.size else None,
            "signal_eau_libre_pct": round(float(np.mean(ndwi_valid > 0.15) * 100), 1) if ndwi_valid.size else None,
            "ndmi_moyen": round(float(np.mean(ndmi_valid)), 3) if ndmi_valid.size else None,
            "ndmi_min": round(float(np.min(ndmi_valid)), 3) if ndmi_valid.size else None,
            "ndmi_max": round(float(np.max(ndmi_valid)), 3) if ndmi_valid.size else None,
            "vegetation_faible_pct": round(float(np.mean(ndvi_valid < 0.2) * 100), 1) if ndvi_valid.size else None,
            "humidite_vegetation_faible_pct": round(float(np.mean(ndmi_valid < 0) * 100), 1) if ndmi_valid.size else None,
            "couverture_pct": round(float(valid_satellite.sum() / valid_terrain.sum() * 100), 1) if valid_terrain.any() else 0.0,
        },
        "stats_pente": {
            "moyenne_pct": round(float(np.mean(slope_valid)), 2) if slope_valid.size else 0.0,
            "p95_pct": round(float(np.percentile(slope_valid, 95)), 2) if slope_valid.size else 0.0,
            "max_pct": round(float(np.max(slope_valid)), 2) if slope_valid.size else 0.0,
        },
        "bounds": {
            "sud": min_lat,
            "nord": max_lat,
            "ouest": min_lon,
            "est": max_lon,
        },
        "periode_recherche": "30 derniers jours",
        "source_satellite": "Mosaïque Sentinel-2 L2A la moins nuageuse sur 30 jours ; nuages, ombres et neige masqués avec SCL",
        "satellite_available": satellite_available,
        "index_definitions": {
            "ndvi": "(B08 - B04) / (B08 + B04): vegetation greenness/vigour",
            "ndwi": "(B03 - B08) / (B03 + B08): open-water indicator (McFeeters)",
            "ndmi": "(B08 - B11) / (B08 + B11): vegetation moisture indicator (Gao)",
        },
        "warnings": warnings,
    }


def build_orthophoto_data_url(geometry_geojson: dict, width_px: int = 1024) -> str:
    """Return orthophoto data URL for the parcel footprint bbox."""
    parcel = shape(geometry_geojson)
    min_lon, min_lat, max_lon, max_lat = parcel.bounds
    return recuperer_orthophoto_ign(min_lon, min_lat, max_lon, max_lat, largeur_px=width_px)
