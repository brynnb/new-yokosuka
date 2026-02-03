import sys
import os

# Add PythonPVR directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), 'PythonPVR'))

import png
from pvmarchive import PvrTexture
from bitstream import BitStream

def convert_pvr(pvr_path, png_path):
    bs = BitStream(pvr_path)
    # Skip PVRT header and size fields if present to reach the color format
    
    # Check if starts with PVRT
    header = bs.readUInt()
    if header == 0x54525650: # PVRT
        size = bs.readUInt()
        # Next is color_format
    else:
        bs.seek_set(0)
    
    pvr = PvrTexture(bs, False, True)
    bitmap = pvr.getBitmap()
    
    if not bitmap:
        print(f"Failed to decode {pvr_path}")
        return
        
    png.from_array(bitmap, 'RGBA').save(png_path)
    print(f"Saved {png_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 pvr_to_png.py <pvr_file> <png_file>")
    else:
        convert_pvr(sys.argv[1], sys.argv[2])
