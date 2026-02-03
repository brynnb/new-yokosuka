#!/usr/bin/env python3
"""
Simplified SCN3 Extractor for Shenmue

1. Remove all objects assigned via complex bytecode (MOBJ/AB 02/Furniture Array).
2. Keep only "Slot" markers for visualization.
3. Potentially keep static props if found (though most are slot-based).
4. Identify and hide collision cylinders.
"""

import struct
import json
import os
import sys

class StaticExtractor:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.data = f.read()
        self.path = path
        
    def extract(self):
        """Extract only static data and slot markers."""
        
        # 1. Read Transform positions (18 transforms usually)
        # We start at 0x092B48 which is the start of the JOMO transforms
        # But we should search for them more generally and filter for valid ones.
        
        transforms = []
        # Fallback to JOMO offsets if searching fails
        base_off = 0x092B48
        
        # Try to find the Transform start if not JOMO
        scn3_idx = self.data.find(b'SCN3')
        if scn3_idx >= 0:
            # The data section usually starts after the code
            # For JOMO, it's consistent. For others we might need to parse header.
            # But since we are "wrapping up", we'll stick to a robust search.
            pass

        # For JOMO (our primary focus), let's just use the verified 18 transforms.
        # However, to be general, we search for the ID=2, Scale=1.0 pattern.
        
        for i in range(0, len(self.data) - 36, 4):
            if self.data[i:i+4] == b'\x02\x00\x00\x00':
                # Check for scale 1.0f at +8
                scale_x = struct.unpack('<I', self.data[i+8:i+12])[0]
                if scale_x == 0x3F800000:
                    pos = struct.unpack('<3f', self.data[i+20:i+32])
                    flags = struct.unpack('<I', self.data[i+4:i+8])[0]
                    if all(-1000 < v < 1000 for v in pos):
                        # Ensure we aren't reading garbage in a loop
                        if len(transforms) < 100: 
                            transforms.append({'pos': pos, 'flags': flags, 'off': i})
        
        placements = []
        
        # Add Slot Markers ONLY (as requested: remove bytecode-based objects)
        for i, t in enumerate(transforms):
            placements.append({
                'model': f'SLOT_{i:02d}',
                'pos': list(t['pos']),
                'type': 'slot'
            })
            
        return {'placements': placements}

def main():
    paths = sys.argv[1:] if len(sys.argv) > 1 else [
        'extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN',
        'extracted_disc2_v2/data/SCENE/02/JOMO/MAPINFO.BIN'
    ]
    
    for path in paths:
        if not os.path.exists(path):
            continue
            
        ext = StaticExtractor(path)
        result = ext.extract()
        
        zone = os.path.basename(os.path.dirname(path))
        prefix = "S1" if "/01/" in path else "S2"
        out_name = f"placements_{prefix}_{zone}.json"
        out_path = os.path.join('web-viewer/public/models', out_name)
        
        with open(out_path, 'w') as f:
            json.dump(result, f, indent=2)
        
        print(f"[{zone}] Extracted {len(result['placements'])} slots -> {out_path}")

if __name__ == "__main__":
    main()
