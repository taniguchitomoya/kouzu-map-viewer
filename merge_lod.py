import json
import glob
import os
from shapely.geometry import Polygon
from shapely.ops import unary_union

def merge_lods():
    input_files = glob.glob("public/tiles/lod/lod_*.json")
    # Exclude the final clusters file itself if it exists
    input_files = [f for f in input_files if not f.endswith("lod_clusters.json")]
    
    if not input_files:
        print("No per-municipality LOD files found.")
        return
        
    print(f"Found {len(input_files)} LOD files to merge.")
    
    all_polygons = []
    
    for f_path in input_files:
        try:
            with open(f_path, "r") as f:
                data = json.load(f)
                for cluster in data:
                    pts = cluster.get("pts", [])
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
                            all_polygons.append(poly)
        except Exception as e:
            print(f"Error reading {f_path}: {e}")
            
    print(f"Total LOD polygons loaded: {len(all_polygons)}")
    
    if not all_polygons:
        print("No valid polygons to merge.")
        return
        
    print("Merging and simplifying polygons...")
    try:
        buffered = [p.buffer(0.00005) for p in all_polygons if p.is_valid]
        merged = unary_union(buffered)
        sp = merged.simplify(0.0001, preserve_topology=False)
    except Exception as e:
        print(f"Merge error: {e}")
        return
        
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
        
    out_file = "public/tiles/lod/lod_clusters.json"
    with open(out_file, "w") as f:
        json.dump(out_data, f)
        
    print(f"Generated {len(geoms)} merged LOD clusters.")
    print(f"Saved to {out_file}")

if __name__ == "__main__":
    merge_lods()
