import os
import struct
import gzip
import io

def unpack_ipac(data, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Header: Signature(4), DictOffset(4), FileCount(4), ContentSize(4)
    sig, dict_offset, file_count, content_size = struct.unpack('<IIII', data[:16])
    
    if data[:4] != b'IPAC':
        # print(f"Invalid IPAC signature: {data[:4]}")
        return

    # Dictionary entries are 20 bytes each: Name(8), Ext(4), Offset(4), Size(4)
    for i in range(file_count):
        entry_pos = dict_offset + (i * 20)
        entry_data = data[entry_pos:entry_pos+20]
        name_raw, ext_raw, offset, size = struct.unpack('<8s4sII', entry_data)
        
        name = name_raw.decode('ascii', errors='ignore').strip('\x00').strip()
        ext = ext_raw.decode('ascii', errors='ignore').strip('\x00').strip()
        
        if not name or not ext: continue
        
        file_content = data[offset:offset+size]
        out_path = os.path.join(output_dir, f"{name}.{ext}")
        
        with open(out_path, 'wb') as f:
            f.write(file_content)

def unpack_bundle(filepath, output_dir):
    with open(filepath, 'rb') as f:
        header = f.read(2)
        f.seek(0)
        if header == b'\x1f\x8b': # GZIP
            with gzip.open(f, 'rb') as gz:
                data = gz.read()
        else:
            data = f.read()
            
    if data[0:4] == b'PAKS' or data[0:4] == b'PAKF':
        # Header: Sig(4), IPACOffset(4), Unk(4), Unk(4)
        sig, ipac_offset = struct.unpack('<II', data[:8])
        unpack_ipac(data[ipac_offset:], output_dir)
    else:
        unpack_ipac(data, output_dir)

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 unpack_ipac.py <file> <output_dir>")
    else:
        unpack_bundle(sys.argv[1], sys.argv[2])
