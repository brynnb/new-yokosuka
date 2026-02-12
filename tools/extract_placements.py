#!/usr/bin/env python3
"""
Extract object placements from MAPINFO.BIN and generate a scene.json for the viewer.
This focuses on finding model references and their associated position data.
"""

import os
import sys
import struct
import re
import json

def extract_placements(mapinfo_path, zone_prefix):
    """Extract object placements from MAPINFO.BIN."""
    with open(mapinfo_path, 'rb') as f:
        data = f.read()
    
    print(f"Analyzing: {mapinfo_path}")
    print(f"File size: {len(data)} bytes")
    
    placements = []
    
    # Find all model references ($NAME.MT5)
    model_pattern = rb'\$([A-Z0-9_]+\.MT5)'
    all_matches = list(re.finditer(model_pattern, data))
    
    for i, match in enumerate(all_matches):
        offset = match.start()
        model_name = match.group(1).decode('ascii')
        
        # Check if previous bytes are part of another filename (concatenated models)
        # If we see .MT5 or $ in the previous 16 bytes, skip position extraction
        prev_bytes = data[max(0, offset-16):offset]
        is_concatenated = b'.MT5' in prev_bytes or (b'$' in prev_bytes[8:])
        
        best_pos = None
        best_scale = [1, 1, 1]
        best_rot = [0, 0, 0]
        
        if not is_concatenated:
            # Check if previous 12 bytes contain valid position floats
            if offset >= 12:
                try:
                    pos_data = data[offset - 12:offset]
                    x, y, z = struct.unpack('<fff', pos_data)
                    
                    # Validate:
                    # 1. Values should be reasonable room coordinates
                    # 2. At least one value should be non-trivial
                    # 3. Exclude very small floats that are likely garbage
                    valid = all(-500 < v < 500 for v in [x, y, z])
                    meaningful = any(abs(v) > 0.5 for v in [x, y, z])
                    not_garbage = all(abs(v) < 1e-10 or abs(v) > 1e-5 for v in [x, y, z])
                    
                    if valid and meaningful and not_garbage:
                        best_pos = (x, y, z)
                except:
                    pass
            
            # Look for scale values at -28 to -16
            if offset >= 28 and best_pos:
                try:
                    scale_data = data[offset - 28:offset - 16]
                    sx, sy, sz = struct.unpack('<fff', scale_data)
                    
                    # Scale should be positive and reasonable (0.1 to 10)
                    if all(0.01 < v < 100 for v in [sx, sy, sz]):
                        best_scale = [sx, sy, sz]
                except:
                    pass
        
        # Determine if this is likely a "child" object (drawer, etc)
        # Child objects often have all zeros before them
        is_child = all(b == 0 for b in data[max(0, offset-12):offset])
        
        placement = {
            'model': f"{zone_prefix}_{model_name.replace('.MT5', '')}.MT5",
            'original_name': model_name,
            'pos': list(best_pos) if best_pos else [0, 0, 0],
            'rot': best_rot,
            'scl': best_scale,
            'is_child': is_child,
            'has_position': best_pos is not None
        }
        
        placements.append(placement)
    
    return placements

def main():
    if len(sys.argv) < 2:
        # Default to JOMO
        zone = "JOMO"
        mapinfo_path = f"extracted_files/data/SCENE/01/{zone}/MAPINFO.BIN"
        zone_prefix = f"S1_{zone}"
    else:
        mapinfo_path = sys.argv[1]
        zone = os.path.basename(os.path.dirname(mapinfo_path))
        zone_prefix = f"S1_{zone}"
    
    if not os.path.exists(mapinfo_path):
        print(f"File not found: {mapinfo_path}")
        return
    
    placements = extract_placements(mapinfo_path, zone_prefix)
    
    print(f"\nFound {len(placements)} model references:")
    
    # Group by position status
    with_pos = [p for p in placements if p['pos'] != [0, 0, 0]]
    without_pos = [p for p in placements if p['pos'] == [0, 0, 0]]
    
    print(f"  With position data: {len(with_pos)}")
    print(f"  Without position data: {len(without_pos)}")
    
    print("\nPlacements with positions:")
    for p in with_pos[:15]:
        print(f"  {p['original_name']}: pos={p['pos']}")
    if len(with_pos) > 15:
        print(f"  ... and {len(with_pos) - 15} more")
    
    print("\nModels without clear positions (placed at origin):")
    for p in without_pos[:10]:
        print(f"  {p['original_name']}")
    if len(without_pos) > 10:
        print(f"  ... and {len(without_pos) - 10} more")
    
    # Write scene.json
    output_path = f"web-viewer/public/models/{zone_prefix}_scene.json"
    
    # Clean up internal fields before saving
    for p in placements:
        if 'offset' in p:
            del p['offset']
        if 'original_name' in p:
            del p['original_name']
        if 'pos_offset' in p:
            del p['pos_offset']
    
    with open(output_path, 'w') as f:
        json.dump(placements, f, indent=2)
    
    print(f"\nSaved scene to: {output_path}")

if __name__ == "__main__":
    main()
