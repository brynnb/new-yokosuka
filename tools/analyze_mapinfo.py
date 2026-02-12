#!/usr/bin/env python3
"""
Extract placement transforms from MAPINFO.BIN SCN3 data.
This tool finds transform blocks (scale + position) and tries to correlate them with model references.

Based on reverse engineering findings:
- Transforms are stored as: [rotation/flags 12 bytes] [scale 12 bytes] [position 12 bytes]
- Model references are stored in a separate string table ($NAME.MT5)
- Slot identifiers (R##_###, DR##_###) link transforms to spawn points
- Full mapping requires SCN3 bytecode parsing (not yet implemented)
"""

import struct
import re
import json
import os
import sys

def find_transforms(data, min_pos=-100, max_pos=100):
    """Find all valid transforms in the data."""
    transforms = []
    
    for i in range(0, len(data) - 24, 4):
        try:
            # Try to parse as scale + position (24 bytes)
            raw = data[i:i+24]
            sx, sy, sz = struct.unpack('<fff', raw[0:12])
            px, py, pz = struct.unpack('<fff', raw[12:24])
            
            # Valid scale: 0.5 to 2.0
            # Valid position: within room bounds
            if (0.5 < sx < 2.0 and 0.5 < sy < 2.0 and 0.5 < sz < 2.0 and
                min_pos < px < max_pos and min_pos < py < max_pos and min_pos < pz < max_pos):
                
                # At least one non-trivial position value
                if any(abs(v) > 0.1 for v in [px, py, pz]) or (px == 0 and py == 0 and pz == 0):
                    transforms.append({
                        'offset': i,
                        'scale': [sx, sy, sz],
                        'position': [px, py, pz]
                    })
        except:
            pass
    
    return transforms

def find_model_refs(data):
    """Find all model name references in the data."""
    refs = []
    for match in re.finditer(rb'\$([A-Z0-9_]+\.MT5)', data):
        refs.append({
            'name': match.group(1).decode('ascii'),
            'offset': match.start()
        })
    return refs

def find_slots(data):
    """Find all slot references (R##_### format)."""
    slots = []
    for i in range(len(data) - 8):
        chunk = data[i:i+8]
        if re.match(rb'^[RD][0-9R][0-9]_[0-9]{3}', chunk):
            name = chunk.decode('ascii', errors='ignore').split('\x00')[0]
            if len(name) >= 7:
                slots.append({
                    'name': name,
                    'offset': i
                })
    return slots

def analyze_mapinfo(mapinfo_path, zone_prefix):
    """Analyze MAPINFO.BIN and extract placement data."""
    with open(mapinfo_path, 'rb') as f:
        data = f.read()
    
    print(f"Analyzing: {mapinfo_path}")
    print(f"File size: {len(data):,} bytes")
    
    # Find components
    transforms = find_transforms(data)
    model_refs = find_model_refs(data)
    slots = find_slots(data)
    
    print(f"\nFound:")
    print(f"  Transforms: {len(transforms)}")
    print(f"  Model refs: {len(model_refs)}")
    print(f"  Slot refs: {len(slots)}")
    
    # Build placement list
    # Strategy: Use transforms as the main driver, 
    # models will be loaded separately and we'll output positions
    
    placements = []
    
    # Filter out duplicate positions (keep unique)
    seen_pos = set()
    for t in transforms:
        pos_key = tuple(round(v, 2) for v in t['position'])
        if pos_key not in seen_pos and pos_key != (0.0, 0.0, 0.0):
            seen_pos.add(pos_key)
            placements.append({
                'transform_offset': hex(t['offset']),
                'pos': t['position'],
                'scl': t['scale']
            })
    
    print(f"  Unique positions: {len(placements)}")
    
    # Show sample placements
    print("\nSample positions (first 20):")
    for p in placements[:20]:
        pos = p['pos']
        print(f"  ({pos[0]:7.2f}, {pos[1]:7.2f}, {pos[2]:7.2f})")
    
    return {
        'transforms': transforms,
        'model_refs': model_refs,
        'slots': slots,
        'unique_positions': placements
    }

def main():
    if len(sys.argv) < 2:
        zone = "JOMO"
        mapinfo_path = f"extracted_files/data/SCENE/01/{zone}/MAPINFO.BIN"
    else:
        mapinfo_path = sys.argv[1]
        zone = os.path.basename(os.path.dirname(mapinfo_path))
    
    zone_prefix = f"S1_{zone}"
    
    if not os.path.exists(mapinfo_path):
        print(f"File not found: {mapinfo_path}")
        return
    
    result = analyze_mapinfo(mapinfo_path, zone_prefix)
    
    # Output JSON
    output = {
        'zone': zone,
        'model_count': len(result['model_refs']),
        'transform_count': len(result['transforms']),
        'positions': result['unique_positions']
    }
    
    output_path = f"web-viewer/public/models/{zone_prefix}_positions.json"
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved positions to: {output_path}")

if __name__ == "__main__":
    main()
