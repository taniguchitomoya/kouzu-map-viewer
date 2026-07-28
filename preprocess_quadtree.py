import json
import os
import glob
import zipfile
import re
import io
import math
import xml.etree.ElementTree as ET
from pyproj import Transformer

DATA_DIR = "public/data"
TILES_DIR = os.path.join(DATA_DIR, "tiles")

def get_epsg_for_zone(zone):
    return f"EPSG:{6668 + zone}"

def find_all(element, tag_name):
    return [e for e in element.iter() if e.tag.endswith(f'}}{tag_name}') or e.tag == tag_name]

def find_one(element, tag_name):
    for e in element.iter():
        if e.tag.endswith(f'}}{tag_name}') or e.tag == tag_name:
            return e
    return None

def lonlat_to_tile(lon, lat, zoom):
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    xtile = int((lon + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile

def process_zip(zf):
    basename = os.path.basename(zf)
    muni_cd = basename.split('-')[0]

    parcels = []
    
    try:
        with zipfile.ZipFile(zf, 'r') as z:
            for info in z.infolist():
                if info.filename.endswith('.zip') and not info.is_dir():
                    with z.open(info) as nested_zip_file:
                        nested_zip_data = io.BytesIO(nested_zip_file.read())
                        with zipfile.ZipFile(nested_zip_data, 'r') as nz:
                            for n_info in nz.infolist():
                                if n_info.filename.endswith('.xml') and not n_info.is_dir():
                                    content = nz.read(n_info).decode('utf-8', errors='ignore')
                                    # Extract coordinate system
                                    coord_match = re.search(r'<[^>]*座標系[^>]*>(.*?)</[^>]*座標系>', content)
                                    if not coord_match: continue
                                    coord = coord_match.group(1).strip()
                                    match = re.search(r'公共(?:測量|座標)(\d+)系', coord)
                                    if not match: continue
                                    crs_zone = int(match.group(1))
                                    epsg_code = get_epsg_for_zone(crs_zone)
                                    
                                    # Transform
                                    transformer = Transformer.from_crs(epsg_code, "EPSG:4326", always_xy=True)
                                    
                                    # Parse without stripping namespaces
                                    root = ET.fromstring(content)
                                    
                                    points = {}
                                    for pt in find_all(root, 'GM_Point'):
                                        pid = pt.get('id')
                                        x_el = find_one(pt, 'X')
                                        y_el = find_one(pt, 'Y')
                                        if pid and x_el is not None and y_el is not None:
                                            px = float(x_el.text)
                                            py = float(y_el.text)
                                            # Math: Py is Easting (X), Px is Northing (Y)
                                            lon, lat = transformer.transform(py, px)
                                            points[pid] = [round(lon, 7), round(lat, 7)]
                                    
                                    curves = {}
                                    for cv in find_all(root, 'GM_Curve'):
                                        cid = cv.get('id')
                                        cv_pts = []
                                        for pt_ref in find_all(cv, 'GM_PointRef.point') or find_all(cv, 'point'):
                                            ref_id = pt_ref.get('idref')
                                            if ref_id in points:
                                                cv_pts.append(points[ref_id])
                                        curves[cid] = cv_pts
                                        
                                    surfaces = {}
                                    for sf in find_all(root, 'GM_Surface'):
                                        sid = sf.get('id')
                                        rings = []
                                        
                                        exterior = find_one(sf, 'GM_SurfaceBoundary.exterior') or find_one(sf, 'exterior')
                                        if exterior is not None:
                                            ext_pts = []
                                            for gen in find_all(exterior, 'GM_CompositeCurve.generator') or find_all(exterior, 'generator'):
                                                ref_id = gen.get('idref')
                                                if ref_id in curves:
                                                    ext_pts.extend(curves[ref_id])
                                            if ext_pts:
                                                rings.append(ext_pts)
                                                
                                        interiors = find_all(sf, 'GM_SurfaceBoundary.interior') or find_all(sf, 'interior')
                                        for interior in interiors:
                                            int_pts = []
                                            for gen in find_all(interior, 'GM_CompositeCurve.generator') or find_all(interior, 'generator'):
                                                ref_id = gen.get('idref')
                                                if ref_id in curves:
                                                    int_pts.extend(curves[ref_id])
                                            if int_pts:
                                                rings.append(int_pts)
                                                
                                        surfaces[sid] = rings
                                        
                                    for fude in find_all(root, '筆'):
                                        fid = fude.get('id')
                                        chiban_el = find_one(fude, '地番')
                                        chiban = chiban_el.text if chiban_el is not None else ''
                                        
                                        # Filter out Chiku-gai
                                        if '地区外' in chiban or '長狭物' in chiban:
                                            continue
                                            
                                        shape_el = find_one(fude, '形状')
                                        if shape_el is not None:
                                            sid = shape_el.get('idref')
                                            if sid in surfaces and surfaces[sid] and len(surfaces[sid][0]) > 2:
                                                rings = surfaces[sid]
                                                ext_pts = rings[0]
                                                min_lon = min(p[0] for p in ext_pts)
                                                max_lon = max(p[0] for p in ext_pts)
                                                min_lat = min(p[1] for p in ext_pts)
                                                max_lat = max(p[1] for p in ext_pts)
                                                cx = (min_lon + max_lon) / 2
                                                cy = (min_lat + max_lat) / 2
                                                
                                                parcels.append({
                                                    'id': f"{basename}|{os.path.basename(info.filename)}|{os.path.basename(n_info.filename)}|{fid or ''}",
                                                    'lbl': chiban,
                                                    'pts': rings,
                                                        'cx': cx,
                                                        'cy': cy
                                                    })
    except Exception as e:
        print(f"Error processing {zf}: {e}")
    
    # Adaptive outlier filter using Median Absolute Deviation (MAD)
    if len(parcels) > 10:
        cxs = sorted([p['cx'] for p in parcels])
        cys = sorted([p['cy'] for p in parcels])
        med_cx = cxs[len(cxs)//2]
        med_cy = cys[len(cys)//2]
        
        dists = [math.sqrt((p['cx'] - med_cx)**2 + (p['cy'] - med_cy)**2) for p in parcels]
        dists.sort()
        mad = dists[len(dists)//2]
        
        # eff_mad: Enforce a minimum MAD (0.02 degrees ~ 2km) to avoid over-filtering tiny municipalities
        # Also enforce a maximum MAD (0.2 degrees ~ 22km) to prevent a heavily skewed dataset from destroying the filter
        eff_mad = max(0.02, min(mad, 0.2))
        
        # Threshold: 10 times the effective MAD
        threshold = eff_mad * 10
        
        valid_parcels = []
        dropped = 0
        for p, d in zip(parcels, dists_unsorted := [math.sqrt((p['cx'] - med_cx)**2 + (p['cy'] - med_cy)**2) for p in parcels]):
            if d <= threshold:
                valid_parcels.append(p)
            else:
                dropped += 1
                
        if dropped > 0:
            print(f"  [Filter] Dropped {dropped} outlier parcels in {basename} (threshold: {threshold:.4f} deg)")
            
        return valid_parcels

    return parcels

def distribute_parcels(parcels, zoom, tiles, max_parcels=3000):
    if len(parcels) == 0:
        return

    # Base case: we are at the root or current level and need to distribute to specific x,y
    grouped = {}
    for p in parcels:
        x, y = lonlat_to_tile(p['cx'], p['cy'], zoom)
        k = f"{zoom}/{x}/{y}"
        if k not in grouped:
            grouped[k] = []
        grouped[k].append(p)
        
    for k, pts in grouped.items():
        if len(pts) > max_parcels and zoom < 16:
            # Further split this tile to zoom + 1
            distribute_parcels(pts, zoom + 1, tiles, max_parcels)
        else:
            tiles[k] = pts

def main():
    os.makedirs(TILES_DIR, exist_ok=True)
    zip_files = glob.glob(os.path.join(DATA_DIR, "*.zip"))
    
    print(f"Found {len(zip_files)} ZIP files. Extracting parcels...")
    
    all_parcels = []
    for zf in zip_files:
        print(f"Processing {zf}...")
        pl = process_zip(zf)
        all_parcels.extend(pl)
        
    print(f"Total public parcels extracted: {len(all_parcels)}")
    
    tiles = {}
    print("Building Adaptive Quadtree (threshold=3000)...")
    # We start grouping at zoom level 12 (typical for city level viewing)
    distribute_parcels(all_parcels, 12, tiles, max_parcels=3000)
    
    print(f"Generated {len(tiles)} tiles. Saving JSONs...")
    tile_keys = {}
    for k, pts in tiles.items():
        z, x, y = k.split('/')
        tile_dir = os.path.join(TILES_DIR, z, x)
        os.makedirs(tile_dir, exist_ok=True)
        tile_path = os.path.join(tile_dir, f"{y}.json")
        
        # Save minimal format, dropping cx/cy
        out_data = []
        for p in pts:
            out_data.append({
                "id": p["id"],
                "lbl": p["lbl"],
                "pts": p["pts"]
            })
            
        with open(tile_path, 'w', encoding='utf-8') as f:
            # Minimized JSON
            json.dump(out_data, f, ensure_ascii=False, separators=(',', ':'))
        tile_keys[k] = len(pts)
        
    index_data = {
        "maxZoom": 16,
        "minZoom": 12,
        "tiles": tile_keys
    }
    with open(os.path.join(DATA_DIR, "public_quadtree_index.json"), 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
        
    print("Done! public_quadtree_index.json generated.")

if __name__ == "__main__":
    main()
