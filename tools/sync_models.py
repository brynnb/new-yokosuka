import os
import shutil
import json
import gzip
import struct

# Base directory relative to this script (project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def extract_texn_with_ids(data):
    """Extracts textures and their 8-byte IDs from TEXN/IPAC/PKS/PKF data."""
    entries = []  # List of (8-byte ID, PVRT data)
    
    # 1. Dictionary-based extraction (for IPAC filename IDs)
    # We do NOT skip to the IPAC offset, we just check if it's there
    ipac_data = None
    if data[:4] in [b'PAKS', b'PAKF']:
        try:
            ipac_off = struct.unpack('<I', data[4:8])[0]
            if ipac_off < len(data):
                ipac_data = data[ipac_off:]
        except: pass
    elif data[:4] == b'IPAC':
        ipac_data = data

    if ipac_data and ipac_data[:4] == b'IPAC':
        try:
            sig, dict_offset, file_count, content_size = struct.unpack('<IIII', ipac_data[:16])
            for i in range(file_count):
                entry_pos = dict_offset + (i * 20)
                name_raw, ext_raw, offset, size = struct.unpack('<8s4sII', ipac_data[entry_pos:entry_pos+20])
                file_content = ipac_data[offset:offset+size]
                
                # If it's a TEXN node within the IPAC, we can get two IDs for it
                if file_content[:4] == b'TEXN':
                    internal_id = file_content[8:16]
                    pvrt_start = file_content.find(b'PVRT', 16)
                    if pvrt_start != -1:
                        pvr_data = file_content[pvrt_start:]
                        entries.append((internal_id, pvr_data))
                        entries.append((name_raw, pvr_data))
                elif file_content[:4] == b'PVRT':
                    entries.append((name_raw, file_content))
        except: pass

    # 2. ALWAYS do a raw scan of the ENTIRE buffer (including before/after IPAC)
    # This catches TEXN nodes sitting loose in PAKS/PAKF files (common in map packs)
    pos = 0
    while True:
        pos = data.find(b'TEXN', pos)
        if pos == -1: break
        try:
            # TEXN: [sig(4)][size(4)][id(8)]
            size = struct.unpack('<I', data[pos+4:pos+8])[0]
            if 16 < size < 0x2000000: # Reasonable limit
                tex_id = data[pos+8:pos+16]
                pvrt_start = data.find(b'PVRT', pos+16, pos+size)
                if pvrt_start != -1:
                    entries.append((tex_id, data[pvrt_start:pos+size]))
            pos += 4
        except: pos += 4
            
    return entries

def get_data(path):
    try:
        with open(path, 'rb') as f:
            d = f.read()
            if d[:2] == b'\x1f\x8b': return gzip.open(path, 'rb').read()
            return d
    except: return None

def sync_models():
    sources = [
        {"path": os.path.join(BASE_DIR, "extracted_files/data/SCENE/01"), "prefix": "S1_"},
        {"path": os.path.join(BASE_DIR, "extracted_disc2_v2/data/SCENE/01"), "prefix": "S1_"},
        {"path": os.path.join(BASE_DIR, "extracted_disc2_v2/data/SCENE/02"), "prefix": "S2_"}
    ]
    
    global_sources = [
        {"path": os.path.join(BASE_DIR, "extracted_disc2_v2/data/MODEL/CHARA"), "prefix": "G_CHARA_"},
        {"path": os.path.join(BASE_DIR, "extracted_disc2_v2/data/MODEL/OBJECT"), "prefix": "G_OBJ_"},
        {"path": os.path.join(BASE_DIR, "extracted_disc2_v2/data/MODEL/ITEM"), "prefix": "G_ITEM_"},
        {"path": os.path.join(BASE_DIR, "extracted_files/data/MODEL/CHARA"), "prefix": "G_CHARA_"},
        {"path": os.path.join(BASE_DIR, "extracted_files/data/MODEL/OBJECT"), "prefix": "G_OBJ_"},
        {"path": os.path.join(BASE_DIR, "extracted_files/data/MODEL/ITEM"), "prefix": "G_ITEM_"}
    ]

    target_dir = os.path.join(BASE_DIR, "public/models")
    if os.path.exists(target_dir): shutil.rmtree(target_dir)
    os.makedirs(target_dir)

    print(f"Deep Syncing (ID-Based Packs)...")
    mt5_exts = ['.mt5', '.mapm', '.map', '.prop', '.chrm']
    total = 0

    # 1. Zone/Scene Sync
    for src in sources:
        root = src["path"]
        prefix = src["prefix"]
        if not os.path.exists(root): continue
        for zone in os.listdir(root):
            z_path = os.path.join(root, zone)
            if not os.path.isdir(z_path) or zone.startswith('.'): continue
            
            # Create texture packs for zone
            zone_db = {} # id -> data (non-time-dependent textures)
            time_dbs = {0: {}, 1: {}, 2: {}, 3: {}}  # Time-of-day texture packs
            extracted_models = {} # name -> data
            
            for f in os.listdir(z_path):
                f_path = os.path.join(z_path, f)
                ext = os.path.splitext(f)[1].lower()
                fname_upper = f.upper()
                data = get_data(f_path)
                if not data: continue
                
                # Check if this is a time-of-day texture pack (MAP0, MAP1, MAP2, MAP3)
                # Also handle YORU (night) textures
                time_index = None
                if fname_upper.startswith('MAP') and len(fname_upper) > 3 and fname_upper[3].isdigit():
                    digit = int(fname_upper[3])
                    if digit in [0, 1, 2, 3]:
                        time_index = digit
                elif fname_upper.startswith('YORU'):
                    # YORU = "night" in Japanese, goes to night pack
                    time_index = 3
                elif fname_upper.startswith('OMG'):
                    # OMG contains overlay textures that often conflict, skip for base
                    continue
                
                # Extract textures
                if time_index is not None:
                    # Time-variant textures go to specific pack
                    for tid, tdata in extract_texn_with_ids(data):
                        time_dbs[time_index][tid] = tdata
                else:
                    # Non-time textures go to base pack
                    for tid, tdata in extract_texn_with_ids(data):
                        zone_db[tid] = tdata

                
                # Extract models
                if ext in ['.pks', '.pkf', '.ipac']:
                    from_ipac = {} # Need helper but for now inline
                    try:
                        d = data
                        if d[:4] in [b'PAKS', b'PAKF']: d = d[struct.unpack('<I', d[4:8])[0]:]
                        if d[:4] == b'IPAC':
                            sig, off, count, _ = struct.unpack('<IIII', d[:16])
                            for i in range(count):
                                ep = off + (i * 20)
                                name_r, ext_r, o, s = struct.unpack('<8s4sII', d[ep:ep+20])
                                # Clean names thoroughly
                                name_str = "".join([chr(c) for c in name_r if c != 0]).strip()
                                ext_str = "".join([chr(c) for c in ext_r if c != 0]).strip()
                                fen = f"{name_str}.{ext_str}"
                                if os.path.splitext(fen)[1].lower() in mt5_exts:
                                    extracted_models[fen] = d[o:o+s]
                    except: pass
                elif ext in mt5_exts:
                    extracted_models[f] = data

            # Save zone assets - base textures
            if zone_db:
                with open(os.path.join(target_dir, f"{prefix}{zone}_textures.bin"), 'wb') as f_out:
                    for tid, tdata in zone_db.items():
                        f_out.write(tid) # 8 bytes
                        f_out.write(struct.pack('<I', len(tdata))) # 4 bytes
                        f_out.write(tdata)
            
            # Save time-of-day texture packs
            for time_idx, time_db in time_dbs.items():
                if time_db:
                    with open(os.path.join(target_dir, f"{prefix}{zone}_textures_{time_idx}.bin"), 'wb') as f_out:
                        for tid, tdata in time_db.items():
                            f_out.write(tid) # 8 bytes
                            f_out.write(struct.pack('<I', len(tdata))) # 4 bytes
                            f_out.write(tdata)
                    print(f"  Created {prefix}{zone}_textures_{time_idx}.bin ({len(time_db)} textures)")

            
            for m_name, m_data in extracted_models.items():
                new_n = f"{prefix}{zone}_{os.path.splitext(m_name)[0]}.MT5"
                with open(os.path.join(target_dir, new_n), 'wb') as f_out: f_out.write(m_data)
                total += 1

    # 2. Global Sync (these usually have embedded textures, but we'll collect any local .PVMs just in case)
    for src in global_sources:
        root = src["path"]
        prefix = src["prefix"]
        if not os.path.exists(root): continue
        for f in os.listdir(root):
            if os.path.splitext(f)[1].lower() == '.mt5':
                new_n = f"{prefix}{os.path.splitext(f)[0]}.MT5"
                shutil.copy2(os.path.join(root, f), os.path.join(target_dir, new_n))
                total += 1

    all_m = [f for f in os.listdir(target_dir) if f.lower().endswith('.mt5')]
    all_m.sort()
    with open(os.path.join(BASE_DIR, "public", "models.json"), 'w') as f:
        json.dump(all_m, f, indent=2)
    print(f"Done! {total} models.")

if __name__ == "__main__":
    sync_models()
