import struct

with open('extracted_files/data/SCENE/01/D000/MAPINFO.BIN', 'rb') as f:
    data = f.read()

# CHRS found at 865560
# Let's look at the internal structure more carefully
pos = 865560
size = struct.unpack('<I', data[pos+4:pos+8])[0]
content = data[pos+8:pos+size]

print(f"CHRS token: offset={pos}, size={size}")
print(f"Header bytes (first 48): {content[:48].hex()}")
print()

# The structure seems to be entries of variable size
# Let's try to identify a pattern

# Dump as 4-byte chunks with interpretation
for i in range(0, min(len(content), 256), 4):
    raw = content[i:i+4]
    as_int = struct.unpack('<I', raw)[0]
    as_float = struct.unpack('<f', raw)[0]
    as_str = raw.decode('ascii', errors='replace')
    
    # Format nicely
    float_str = f"{as_float:12.3f}" if -100000 < as_float < 100000 else f"{'N/A':>12}"
    print(f"+{i:04d}: {raw.hex():8}  int={as_int:10}  float={float_str}  str='{as_str}'")
