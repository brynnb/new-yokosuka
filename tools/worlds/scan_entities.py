import struct

with open('extracted_files/data/SCENE/01/D000/MAPINFO.BIN', 'rb') as f:
    data = f.read()

# SCAN FOR FLOATS
# A common pattern is [RotX,RotY,RotZ][SclX,SclY,SclZ][PosX,PosY,PosZ]
# Where Pos is often around 0-500, Scale is around 1.0, and Rot is large integers.
entities = []
for i in range(0, len(data) - 36, 4):
    try:
        raw = data[i:i+36]
        # Position floats are at the end
        px, py, pz = struct.unpack('<fff', raw[24:36])
        sx, sy, sz = struct.unpack('<fff', raw[12:24])
        
        # Heuristic: Scale is usually positive and roughly 1.0 (0.1 to 10.0)
        # Position should not be insanely huge
        if 0.001 < abs(sx) < 10.0 and abs(px) < 100000.0 and sx == sy == sz:
            # Check if there's an index or string nearby
            # Most likely the name is BEFORE the transform
            entities.append((i, px, py, pz, sx))
            if len(entities) > 50: break
    except: pass

for e in entities:
    print(f"Offset {e[0]}: POS({e[1]:.2f}, {e[2]:.2f}, {e[3]:.2f}) SCL({e[4]:.2f})")
