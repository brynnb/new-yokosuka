#!/usr/bin/env python3
import struct
import re
import json
import os

class SCN3Decompiler:
    def __init__(self, path):
        with open(path, 'rb') as f: self.data = f.read()
        self.idx = self.data.find(b'SCN3')
        if self.idx < 0: raise ValueError("No SCN3 found")
        
        # Header (starts at SCN3 + 8)
        self.scn3_header_start = self.idx + 8
        h = struct.unpack('<12I', self.data[self.scn3_header_start : self.scn3_header_start+48])
        # Documentation: 
        # +0: version, +4: code_off, +8: data_off, +12: total_size, +16: code_size
        self.version = h[0]
        self.code_off = h[1]
        self.data_off = h[2]
        self.total_size = h[3]
        self.code_size = h[4]
        
        self.code_start = self.scn3_header_start + self.code_off
        self.data_start = self.scn3_header_start + self.data_off
        
    def read_u32(self, off): return struct.unpack('<I', self.data[off:off+4])[0]
    def read_float(self, off): return struct.unpack('<f', self.data[off:off+4])[0]

    def decompile(self):
        print(f"--- Complete SCN3 Decompilation ---")
        print(f"Code Start: 0x{self.code_start:X}, Size: 0x{self.code_size:X}")
        print(f"Data Start: 0x{self.data_start:X}")
        
        # 1. Identify Room Transforms
        # Pattern: [ID=2][Flags][ScaleX][ScaleY][ScaleZ][PosX][PosY][PosZ][Rot]
        self.rooms = []
        for i in range(self.data_start, self.data_start + 0x10000, 4):
            if i+36 > len(self.data): break
            if self.read_u32(i) == 2 and self.read_u32(i+8) == 0x3F800000:
                # Potential room transform
                rid, f1, sx, sy, sz, px, py, pz, r = struct.unpack('<2I7f', self.data[i:i+36])
                # Filter for valid positions
                if all(-200 < v < 200 for v in [px, py, pz]):
                    self.rooms.append({'id': len(self.rooms), 'pos': (px, py, pz), 'off': i})
        print(f"Confirmed {len(self.rooms)} Room Transforms (Slots).")

        # 2. Identify MOBJ Table
        # 8 bytes per entry: [SlotID: 4][Parent: 4]
        self.mobj_entries = []
        m_off = 0
        for i in range(self.data_start, len(self.data) - 100, 4):
            # Header check: SlotID < numRooms, Parent = -1
            if self.read_u32(i) < len(self.rooms) and self.read_u32(i+4) == 0xFFFFFFFF:
                curr = i
                temp = []
                while curr < len(self.data) - 8:
                    sid, par = struct.unpack('<2I', self.data[curr:curr+8])
                    if sid < len(self.rooms) and par == 0xFFFFFFFF:
                        temp.append(sid); curr += 8
                    else: break
                if len(temp) >= 8:
                    self.mobj_entries = temp; m_off = i; break
        print(f"Confirmed MOBJ Table @ 0x{m_off:X} with {len(self.mobj_entries)} entries.")

        # 3. Identify String Table
        # Extract all $ and DR strings
        self.strings = {}
        for m in re.finditer(rb'(DR[0-9]{2}_[0-9]{3}|\$[A-Z0-9_]+\.MT5)', self.data):
            self.strings[m.start()] = m.group().decode()
        print(f"Extracted {len(self.strings)} Model Strings.")

        # 4. Chase Pointers & Bytecode Commands
        # We look for the "Set Model" packet: [PTR-8][Type][AB 02 Entry 00]
        self.final_mapping = {}
        for s_off, name in self.strings.items():
            # Standard pointer to string or string-8
            for p_off in [s_off, s_off - 8]:
                ptr_bytes = struct.pack('<I', p_off)
                for m in re.finditer(re.escape(ptr_bytes), self.data):
                    loc = m.start()
                    # Check for AB 02 in the next 12 bytes
                    context = self.data[loc+4 : loc+24]
                    for match in re.finditer(rb'\xab\x02(.)\x00', context):
                        entry_idx = match.group(1)[0]
                        if entry_idx < len(self.mobj_entries):
                            slot_id = self.mobj_entries[entry_idx]
                            m_name = name.replace('$', '')
                            if not m_name.endswith('.MT5'): m_name += '.MT5'
                            self.final_mapping[slot_id] = m_name
                            print(f"BYTECODE LINK: Entry {entry_idx:2d} (Slot {slot_id:02d}) -> {m_name}")

        # 5. Furniture Fallback (Master Index Array)
        # Search for a chunk of bytes with length numEntries, near the Data section
        # JOMO: [0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 6, 6, 7, 15, 14, 14, 14, 21]
        furniture_models = [v for k,v in self.strings.items() if v.startswith('$')]
        for i in range(self.data_start, m_off):
            chunk = self.data[i : i+len(self.mobj_entries)]
            if len(set(chunk)) > 5 and all(v < len(furniture_models) for v in chunk if v != 0):
                print(f"FOUND FURNITURE ARRAY @ 0x{i:7X}: {list(chunk)}")
                for e_idx, m_idx in enumerate(chunk):
                    slot_id = self.mobj_entries[e_idx]
                    if slot_id not in self.final_mapping and m_idx < len(furniture_models):
                        self.final_mapping[slot_id] = furniture_models[m_idx].replace('$', '')
                break

        print(f"\nFinal Verified Placements ({len(self.final_mapping)} objects):")
        for s, m in sorted(self.final_mapping.items()):
            print(f"  Slot {s:02d}: {m}")

        # 6. Save results
        return {
            'placements': [{'model': m, 'pos': self.rooms[s]['pos'], 'type': 'object'} for s, m in self.final_mapping.items()],
            'slots': [{'model': f'SLOT_{i:02d}', 'pos': r['pos'], 'type': 'slot'} for i, r in enumerate(self.rooms)]
        }

if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else 'extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN'
    dec = SCN3Decompiler(path)
    results = dec.decompile()
    
    # Write to placements.json for web viewer
    zone = os.path.basename(os.path.dirname(path))
    prefix = "S1" if "01" in path else "S2"
    out_path = f'web-viewer/public/models/placements_{prefix}_{zone}.json'
    with open(out_path, 'w') as f:
        json.dump({'placements': results['placements'] + results['slots']}, f, indent=2)
    print(f"\nSaved to {out_path}")
