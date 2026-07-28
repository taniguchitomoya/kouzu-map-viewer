import json
import os
import glob
import zipfile
import re
import io
import concurrent.futures
import collections

DATA_DIR = "public/data"

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]
def extract_metadata_from_xml(xml_content):
    coord_match = re.search(r'<[^>]*座標系[^>]*>(.*?)</[^>]*座標系>', xml_content)
    coord = coord_match.group(1).strip() if coord_match else ''
    is_public = bool(re.search(r'公共(?:測量|座標)\d+系', coord))
    
    if is_public:
        return True, {}, {}
        
    counts = collections.defaultdict(int)
    pattern = re.compile(r"<[^>]*大字名[^>]*>(.*?)</[^>]*大字名>|<[^>]*丁目名[^>]*>(.*?)</[^>]*丁目名>")
    current_oaza = None
    
    for match in pattern.finditer(xml_content):
        if match.group(1) is not None:
            if current_oaza is not None:
                counts[(current_oaza, "")] += 1
            current_oaza = match.group(1)
        elif match.group(2) is not None:
            if current_oaza is not None:
                counts[(current_oaza, match.group(2))] += 1
                current_oaza = None
                
    if current_oaza is not None:
         counts[(current_oaza, "")] += 1
         
    oaza_stats = collections.defaultdict(int)
    oaza_chomes = collections.defaultdict(set)
    for (oaza, chome), count in counts.items():
        oaza_stats[oaza] += count
        if chome:
            oaza_chomes[oaza].add(chome)
            
    # Sort chomes
    sorted_chomes = {oaza: sorted(list(chomes), key=natural_sort_key) for oaza, chomes in oaza_chomes.items()}
    
    return False, dict(oaza_stats), sorted_chomes

def process_xml_file(f, filename, basename, place_xmls):
    content = f.read().decode('utf-8', errors='ignore')
    is_public, oaza_stats, oaza_chomes = extract_metadata_from_xml(content)
    
    if not is_public:
        if not oaza_stats:
            oaza_stats = {"不明な地域": 1}
            oaza_chomes = {"不明な地域": []}
            
        total_parcels = sum(oaza_stats.values())
            
        for oaza in oaza_stats.keys():
            if oaza not in place_xmls:
                place_xmls[oaza] = []
            
            existing = [x['filename'] for x in place_xmls[oaza]]
            if filename not in existing:
                place_xmls[oaza].append({
                    "filename": filename,
                    "zipFile": basename,
                    "chomes": oaza_chomes.get(oaza, []),
                    "allChomes": oaza_chomes,
                    "totalParcels": total_parcels,
                    "oazaStats": oaza_stats
                })

def process_zip(zf):
    basename = os.path.basename(zf)
    muni_cd = basename.split('-')[0]
    place_xmls = {}
    
    try:
        with zipfile.ZipFile(zf, 'r') as z:
            for info in z.infolist():
                if info.filename.endswith('.xml') and not info.is_dir():
                    with z.open(info) as f:
                        process_xml_file(f, info.filename, basename, place_xmls)
                elif info.filename.endswith('.zip') and not info.is_dir():
                    with z.open(info) as nested_zip_file:
                        nested_zip_data = io.BytesIO(nested_zip_file.read())
                        with zipfile.ZipFile(nested_zip_data, 'r') as nz:
                            for n_info in nz.infolist():
                                if n_info.filename.endswith('.xml') and not n_info.is_dir():
                                    with nz.open(n_info) as nf:
                                        process_xml_file(nf, n_info.filename, basename, place_xmls)
                                        
        if place_xmls:
            output_file = os.path.join(DATA_DIR, f"index_{muni_cd}.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(place_xmls, f, ensure_ascii=False, indent=2)
            print(f"Restored {basename} -> Generated {output_file} with {len(place_xmls)} distinct locations.")
            
    except Exception as e:
        print(f"Failed to process {zf}: {e}")

def main():
    zip_files = glob.glob(os.path.join(DATA_DIR, "*.zip"))
    print(f"Found {len(zip_files)} ZIP files. Restoring specific files in parallel...")
    
    with concurrent.futures.ProcessPoolExecutor() as executor:
        executor.map(process_zip, zip_files)
        
    print("All tasks completed successfully!")

if __name__ == "__main__":
    main()
