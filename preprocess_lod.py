import json
import os
import glob
import sys
from shapely.geometry import Polygon

TILES_DIR = "public/data/tiles"
LOD_DIR = "public/tiles/lod"

def process_tiles(target_muni_cd=None):
    os.makedirs(LOD_DIR, exist_ok=True)
    
    tile_files = glob.glob(os.path.join(TILES_DIR, "**", "*.json"), recursive=True)
    if not tile_files:
        print(f"No tile files found in {TILES_DIR}.")
        sys.exit(1)
        
    print(f"Found {len(tile_files)} tile files. Extracting polygons...")
    
    # muni_cd -> list of polygons
    polygons_by_muni = {}
    
    for f_path in tile_files:
        try:
            with open(f_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for p in data:
                    pid = p.get("id", "")
                    if not pid: continue
                    
                    # id format is typically "muni_cd-..."
                    muni_cd = pid.split('-')[0]
                    
                    if target_muni_cd and target_muni_cd != "all" and muni_cd != target_muni_cd:
                        continue
                        
                    pts = p.get("pts", [])
                    if len(pts) > 0:
                        is_new_format = isinstance(pts[0], list) and len(pts[0]) > 0 and isinstance(pts[0][0], list)
                        if is_new_format:
                            ext = pts[0]
                            holes = pts[1:] if len(pts) > 1 else None
                            poly = Polygon(ext, holes)
                        else:
                            if len(pts) >= 3:
                                poly = Polygon(pts)
                            else:
                                continue
                                
                        if poly.is_valid:
                            if muni_cd not in polygons_by_muni:
                                polygons_by_muni[muni_cd] = []
                            polygons_by_muni[muni_cd].append(poly)
        except Exception as e:
            print(f"Error reading {f_path}: {e}")
            
    if not polygons_by_muni:
        print("No valid polygons found to process.")
        sys.exit(0)
        
    from shapely.ops import unary_union
    
    for muni_cd, polys in polygons_by_muni.items():
        print(f"[{muni_cd}] Merging and simplifying {len(polys)} polygons...")
        
        try:
            # slightly buffer to bridge small gaps between parcels before union
            buffered = [p.buffer(0.00005) for p in polys if p.is_valid]
            merged = unary_union(buffered)
            # simplify the resulting union
            sp = merged.simplify(0.0001, preserve_topology=False)
        except Exception as e:
            print(f"[{muni_cd}] Merge error: {e}")
            continue
            
        geoms = []
        if sp.is_valid and not sp.is_empty:
            if sp.geom_type == 'Polygon':
                geoms.append(sp)
            else:
                geoms.extend(list(sp.geoms))
                
        out_data = []
        for g in geoms:
            if g.is_empty: continue
            rings = []
            ext_pts = [[round(pt[0], 6), round(pt[1], 6)] for pt in g.exterior.coords]
            rings.append(ext_pts)
            for interior in g.interiors:
                int_pts = [[round(pt[0], 6), round(pt[1], 6)] for pt in interior.coords]
                rings.append(int_pts)
                
            out_data.append({
                "id": "LOD",
                "lbl": "",
                "pts": rings
            })
            
        out_file = os.path.join(LOD_DIR, f"lod_{muni_cd}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, separators=(',', ':'))
            
        print(f"[{muni_cd}] Generated {len(geoms)} LOD clusters. Saved to {out_file}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_muni = sys.argv[1]
        print(f"Generating LOD for municipality: {target_muni}")
        process_tiles(target_muni)
    else:
        print("Usage: python3 preprocess_lod.py <municipality_code|all>")
        print("Example: python3 preprocess_lod.py 13102")
        print("Example: python3 preprocess_lod.py all")
        sys.exit(1)
