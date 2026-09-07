import os
import struct
import sys

def extract_texn_with_ids(data):
    entries = []
    pos = 0
    while True:
        pos = data.find(b'TEXN', pos)
        if pos == -1: break
        try:
            size = struct.unpack('<I', data[pos+4:pos+8])[0]
            if 16 < size < 0x2000000:
                tex_id = data[pos+8:pos+16]
                pvrt_start = data.find(b'PVRT', pos+16, pos+size)
                if pvrt_start != -1:
                    entries.append((tex_id, data[pvrt_start:pos+size]))
            pos += 4
        except: pos += 4
    return entries

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 extract_single.py <file>")
        return
    
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    
    entries = extract_texn_with_ids(data)
    print(f"Found {len(entries)} textures")
    
    if not os.path.exists('extracted_tex'):
        os.makedirs('extracted_tex')
        
    for i, (tid, tdata) in enumerate(entries):
        name = "".join([chr(c) for c in tid if 32 <= c <= 126]).strip()
        if not name: name = f"tex_{i}"
        out_path = f"extracted_tex/{name}.pvr"
        with open(out_path, 'wb') as f:
            f.write(tdata)
        print(f"Saved {out_path} ({len(tdata)} bytes)")

if __name__ == "__main__":
    main()
