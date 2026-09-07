#!/usr/bin/env python3
"""
SCN3 Scene Placement Extractor for Shenmue MAPINFO.BIN files

This tool extracts object transforms (position, scale) and correlates them 
with model and slot references from the SCN3 section of MAPINFO.BIN.

File Structure Analysis:
========================
SCN3 Header (at offset 0x10 after MAPINFO header):
  +0x00: uint32 - Version/flags (0x00020000)
  +0x04: uint32 - Relative offset to code section 
  +0x08: uint32 - Relative offset to data section
  +0x0C: uint32 - Total SCN3 size
  +0x10: uint32 - Code section size
  +0x18: uint32 - Header size (typically 48/0x30 bytes)

After the header comes SH-4/converted bytecode.
The data section contains:
  - Float transforms (scale + position)
  - Slot name strings (R##_###, DR##_###)
  - Model references ($NAME.MT5)

Transform Structure:
  [12 bytes scale XYZ][12 bytes position XYZ]
  Or with slot reference:
  [4 bytes slot_ptr][4 bytes unk][12 bytes scale][12 bytes position]

Based on reverse engineering of MAPINFO.BIN and in part on wulinshu.com documentation
"""

import struct
import re
import json
import os
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path


@dataclass
class ObjectPlacement:
    """Represents an object's placement in the scene."""
    offset: int
    position: Tuple[float, float, float]
    scale: Tuple[float, float, float] = (1.0, 1.0, 1.0)
    rotation: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    slot_name: str = ""
    model_name: str = ""
    
    def to_dict(self) -> Dict:
        return {
            'offset': f"0x{self.offset:X}",
            'position': list(self.position),
            'scale': list(self.scale),
            'rotation': list(self.rotation),
            'slot': self.slot_name,
            'model': self.model_name
        }


@dataclass
class SCN3Header:
    """SCN3 section header."""
    version: int
    code_offset: int
    data_offset: int
    total_size: int
    code_size: int
    header_size: int


class SCN3PlacementExtractor:
    """
    Extracts placement data from SCN3 section of MAPINFO.BIN.
    """
    
    def __init__(self, filepath: str):
        self.filepath = filepath
        with open(filepath, 'rb') as f:
            self.data = f.read()
        
        self.scn3_start = 0
        self.header: Optional[SCN3Header] = None
        self.placements: List[ObjectPlacement] = []
        self.model_refs: List[Tuple[int, str]] = []
        self.slot_refs: List[Tuple[int, str]] = []
        
    def find_scn3(self) -> bool:
        """Locate SCN3 section in file."""
        idx = self.data.find(b'SCN3')
        if idx < 0:
            return False
        self.scn3_start = idx + 8  # After 'SCN3' + size
        return True
    
    def parse_header(self) -> bool:
        """Parse SCN3 header."""
        off = self.scn3_start
        
        self.header = SCN3Header(
            version=struct.unpack('<I', self.data[off:off+4])[0],
            code_offset=struct.unpack('<I', self.data[off+4:off+8])[0],
            data_offset=struct.unpack('<I', self.data[off+8:off+12])[0],
            total_size=struct.unpack('<I', self.data[off+12:off+16])[0],
            code_size=struct.unpack('<I', self.data[off+16:off+20])[0],
            header_size=struct.unpack('<I', self.data[off+24:off+28])[0]
        )
        return True
    
    def read_float(self, offset: int) -> float:
        return struct.unpack('<f', self.data[offset:offset+4])[0]
    
    def read_uint32(self, offset: int) -> int:
        return struct.unpack('<I', self.data[offset:offset+4])[0]
    
    def is_valid_float(self, v: float) -> bool:
        """Check if float is valid (not nan/inf, reasonable range)."""
        import math
        if math.isnan(v) or math.isinf(v):
            return False
        return abs(v) < 100000
    
    def find_model_refs(self):
        """Find all $MODEL.MT5 references."""
        self.model_refs = []
        for match in re.finditer(rb'\$([A-Z0-9_]+\.MT5)', self.data):
            self.model_refs.append((match.start(), match.group(1).decode('ascii')))
    
    def find_slot_refs(self):
        """Find all slot references (R##_###, DR##_###)."""
        self.slot_refs = []
        pattern = rb'(?:DR?[0-9]{2}_[0-9]{3})'
        for match in re.finditer(pattern, self.data):
            text = match.group(0).decode('ascii', errors='ignore')
            self.slot_refs.append((match.start(), text))
    
    def extract_transforms(self):
        """
        Extract object transforms from the data section.
        
        Looking for patterns:
        - [scale X][scale Y][scale Z][pos X][pos Y][pos Z] (24 bytes)
        - Where scale is typically (1.0, 1.0, 1.0)
        - Position is room coordinates
        """
        self.placements = []
        
        if not self.header:
            return
        
        # Data section starts at scn3_start + data_offset
        data_start = self.scn3_start + self.header.data_offset
        data_end = self.scn3_start + self.header.total_size
        
        # Scan for transform patterns
        seen_positions = set()
        
        for i in range(data_start, min(data_end, len(self.data) - 24), 4):
            try:
                # Read potential scale + position (24 bytes)
                sx = self.read_float(i)
                sy = self.read_float(i + 4)
                sz = self.read_float(i + 8)
                px = self.read_float(i + 12)
                py = self.read_float(i + 16)
                pz = self.read_float(i + 20)
                
                # Validate scale (should be close to 1.0 for most objects)
                if not all(0.01 < abs(v) < 100 and self.is_valid_float(v) for v in [sx, sy, sz]):
                    continue
                
                # Validate position
                if not all(self.is_valid_float(v) and abs(v) < 500 for v in [px, py, pz]):
                    continue
                
                # Skip all-zero or all-one positions
                pos_key = (round(px, 2), round(py, 2), round(pz, 2))
                if pos_key == (0.0, 0.0, 0.0):
                    continue
                if pos_key == (1.0, 1.0, 1.0):
                    continue
                
                # Skip duplicates
                if pos_key in seen_positions:
                    continue
                seen_positions.add(pos_key)
                
                # This looks like a valid transform
                placement = ObjectPlacement(
                    offset=i,
                    scale=(sx, sy, sz),
                    position=(px, py, pz)
                )
                
                # Try to correlate with nearby slot reference
                placement.slot_name = self.find_nearby_slot(i)
                
                self.placements.append(placement)
                
            except Exception:
                continue
    
    def find_nearby_slot(self, transform_offset: int) -> str:
        """Find slot name referenced near this transform offset."""
        # Look for pointers in the 32 bytes before the transform
        for back in range(4, 64, 4):
            ptr_off = transform_offset - back
            if ptr_off < 0:
                break
            
            try:
                ptr = self.read_uint32(ptr_off)
                # Check if this pointer points to a slot string
                for slot_off, slot_name in self.slot_refs:
                    if ptr == slot_off:
                        return slot_name
            except:
                continue
        
        return ""
    
    def correlate_models(self):
        """
        Try to correlate model names with placements.
        
        This is complex because the bytecode contains the actual mapping.
        For now, we can't directly correlate without full bytecode parsing.
        """
        # This would require parsing the bytecode function calls
        # that set up model loading for each slot
        pass
    
    def analyze(self) -> bool:
        """Run full analysis."""
        if not self.find_scn3():
            print("ERROR: Could not find SCN3 section")
            return False
        
        if not self.parse_header():
            print("ERROR: Could not parse SCN3 header")
            return False
        
        print(f"SCN3 Section:")
        print(f"  Start: 0x{self.scn3_start:X}")
        print(f"  Version: 0x{self.header.version:X}")
        print(f"  Header size: {self.header.header_size}")
        print(f"  Code offset: 0x{self.header.code_offset:X}")
        print(f"  Data offset: 0x{self.header.data_offset:X}")
        print(f"  Total size: {self.header.total_size:,}")
        
        self.find_model_refs()
        print(f"\nModel references: {len(self.model_refs)}")
        
        self.find_slot_refs()
        print(f"Slot references: {len(self.slot_refs)}")
        
        self.extract_transforms()
        print(f"Object placements: {len(self.placements)}")
        
        self.correlate_models()
        
        return True
    
    def get_summary(self) -> Dict:
        """Get analysis summary as dict."""
        zone = os.path.basename(os.path.dirname(self.filepath))
        return {
            'zone': zone,
            'file': self.filepath,
            'scn3_start': f"0x{self.scn3_start:X}",
            'header': {
                'version': f"0x{self.header.version:X}",
                'code_offset': f"0x{self.header.code_offset:X}",
                'data_offset': f"0x{self.header.data_offset:X}",
                'total_size': self.header.total_size
            } if self.header else None,
            'model_count': len(self.model_refs),
            'slot_count': len(self.slot_refs),
            'placement_count': len(self.placements),
            'models': [{'offset': f"0x{off:X}", 'name': name} for off, name in self.model_refs],
            'slots': [{'offset': f"0x{off:X}", 'name': name} for off, name in self.slot_refs],
            'placements': [p.to_dict() for p in self.placements]
        }
    
    def print_summary(self, max_placements: int = 30):
        """Print human-readable summary."""
        print("\n" + "="*60)
        print("OBJECT PLACEMENTS")
        print("="*60)
        
        for i, p in enumerate(self.placements[:max_placements]):
            pos = p.position
            slot = p.slot_name if p.slot_name else "-"
            print(f"  {i+1:3d}. 0x{p.offset:06X}: ({pos[0]:8.3f}, {pos[1]:8.3f}, {pos[2]:8.3f}) slot={slot}")
        
        if len(self.placements) > max_placements:
            print(f"  ... and {len(self.placements) - max_placements} more")
        
        print("\n" + "="*60)
        print("MODEL REFERENCES (sample)")
        print("="*60)
        for off, name in self.model_refs[:20]:
            print(f"  0x{off:06X}: {name}")
        if len(self.model_refs) > 20:
            print(f"  ... and {len(self.model_refs) - 20} more")
        
        print("\n" + "="*60)
        print("SLOT REFERENCES")
        print("="*60)
        for off, name in self.slot_refs[:20]:
            print(f"  0x{off:06X}: {name}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Extract object placements from Shenmue MAPINFO.BIN files'
    )
    parser.add_argument('file', nargs='?',
                        default='extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN',
                        help='Path to MAPINFO.BIN')
    parser.add_argument('-o', '--output',
                        default='web-viewer/public/models',
                        help='Output directory')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Show detailed output')
    
    args = parser.parse_args()
    
    print("="*60)
    print("SCN3 PLACEMENT EXTRACTOR")
    print("="*60)
    print(f"File: {args.file}")
    print()
    
    try:
        extractor = SCN3PlacementExtractor(args.file)
        
        if not extractor.analyze():
            sys.exit(1)
        
        if args.verbose:
            extractor.print_summary()
        
        # Save JSON output
        zone = os.path.basename(os.path.dirname(args.file))
        output_path = os.path.join(args.output, f"S1_{zone}_placements.json")
        
        os.makedirs(args.output, exist_ok=True)
        summary = extractor.get_summary()
        
        with open(output_path, 'w') as f:
            json.dump(summary, f, indent=2)
        print(f"\nSaved: {output_path}")
        
    except FileNotFoundError:
        print(f"Error: File not found: {args.file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
