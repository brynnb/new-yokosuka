import struct

with open('extracted_files/data/SCENE/01/D000/MAPINFO.BIN', 'rb') as f:
    data = f.read()

pos = 0
found = 0
while pos < len(data) and found < 10:
    pos = data.find(b'CHRS', pos)
    if pos == -1: break
    size = struct.unpack('<I', data[pos+4:pos+8])[0]
    content = data[pos+8:pos+size]
    print(f"CHRS at {pos} size {size}")
    # Try to find floats at the end
    if len(content) >= 36:
        raw = content[-36:]
        try:
            px, py, pz = struct.unpack('<fff', raw[-12:])
            print(f"  POS: {px}, {py}, {pz}")
        except: pass
    pos += 4
    found += 1
