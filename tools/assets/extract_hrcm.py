import os
import sys

def extract_hrcm(filepath, output_prefix):
    with open(filepath, 'rb') as f:
        data = f.read()
    
    pos = 0
    count = 0
    while True:
        pos = data.find(b'HRCM', pos)
        if pos == -1: break
        
        # Estimate size? Or just extract till next HRCM or end
        next_pos = data.find(b'HRCM', pos + 4)
        if next_pos == -1:
            next_pos = len(data)
        
        mt5_data = data[pos:next_pos]
        out_name = f"{output_prefix}_{count:02d}.mt5"
        with open(out_name, 'wb') as f_out:
            f_out.write(mt5_data)
        print(f"Extracted {out_name} (offset {pos}, size {len(mt5_data)})")
        
        pos = next_pos
        count += 1

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 extract_hrcm.py <file> <prefix>")
    else:
        extract_hrcm(sys.argv[1], sys.argv[2])
