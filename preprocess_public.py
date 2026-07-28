import json
import os
import glob
import zipfile
import re
import io
import concurrent.futures

DATA_DIR = "public/data"

def process_zip(zf):
    basename = os.path.basename(zf)
    muni_cd = basename.split('-')[0]
    
    # Restrict to 23 wards (13101 to 13123)
    if not (muni_cd.startswith("131") and 1 <= int(muni_cd[3:]) <= 23):
        return
        
    public_files = []
    
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
                                    coord_match = re.search(r'<[^>]*座標系[^>]*>(.*?)</[^>]*座標系>', content)
                                    coord = coord_match.group(1).strip() if coord_match else ''
                                    
                                    match = re.search(r'公共(?:測量|座標)(\d+)系', coord)
                                    if match:
                                        crs_zone = int(match.group(1))
                                        
                                        map_name_match = re.search(r'<[^>]*地図名[^>]*>(.*?)</[^>]*地図名>', content)
                                        map_name = map_name_match.group(1) if map_name_match else '不明な地図'
                                        
                                        xs = [float(x) for x in re.findall(r'<[^>]*X>([-\d\.]+)</[^>]*X>', content)]
                                        ys = [float(y) for y in re.findall(r'<[^>]*Y>([-\d\.]+)</[^>]*Y>', content)]
                                        
                                        if xs and ys:
                                            public_files.append({
                                                "filename": n_info.filename,
                                                "zipFile": basename,
                                                "crs": crs_zone,
                                                "mapName": map_name,
                                                "bbox": [min(xs), min(ys), max(xs), max(ys)] # [minX, minY, maxX, maxY]
                                            })
                                            
        if public_files:
            output_file = os.path.join(DATA_DIR, f"public_index_{muni_cd}.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(public_files, f, ensure_ascii=False, indent=2)
            print(f"Restored {basename} -> Generated {output_file} with {len(public_files)} public maps.")
            
    except Exception as e:
        print(f"Failed to process {zf}: {e}")

def main():
    zip_files = glob.glob(os.path.join(DATA_DIR, "*.zip"))
    # Filter 23 wards in python
    target_zips = [zf for zf in zip_files if os.path.basename(zf).startswith("131") and 1 <= int(os.path.basename(zf)[3:5]) <= 23]
    print(f"Found {len(target_zips)} ZIP files for 23 Wards. Processing in parallel...")
    
    with concurrent.futures.ProcessPoolExecutor() as executor:
        executor.map(process_zip, target_zips)
        
    print("All tasks completed successfully!")

if __name__ == "__main__":
    main()
