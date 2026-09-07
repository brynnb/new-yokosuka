#!/usr/bin/env python3
"""
Shenmue Furniture Placement Extractor v2

Parses the SCN3 section to extract furniture placements with proper parent-child transforms.
The SCN3 data section contains:
1. Room transforms (absolute positions for furniture bases)
2. Object definitions with relative transforms for child objects (drawers, shelves)
3. Model name string table
"""

import struct
import re
import json
import os
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional

@dataclass
class Transform:
    position: Tuple[float, float, float]
    scale: Tuple[float, float, float] = (1.0, 1.0, 1.0)
    rotation: Tuple[float, float, float] = (0.0, 0.0, 0.0)

@dataclass 
class FurnitureObject:
    index: int
    model: str
    relative_transform: Optional[Transform] = None
    parent_index: int = -1
    absolute_position: Optional[Tuple[float, float, float]] = None

class FurnitureExtractor:
    def __init__(self, mapinfo_path: str):
        with open(mapinfo_path, 'rb') as f:
            self.data = f.read()
        self.path = mapinfo_path
        
        # Section info
        self.scn3_start = 0
        self.data_offset = 0
        
        # Extracted data
        self.room_transforms: List[Transform] = []
        self.furniture_objects: List[FurnitureObject] = []
        
    def read_float(self, offset: int) -> float:
        return struct.unpack('<f', self.data[offset:offset+4])[0]
    
    def read_uint32(self, offset: int) -> int:
        return struct.unpack('<I', self.data[offset:offset+4])[0]
    
    def find_scn3(self) -> bool:
        idx = self.data.find(b'SCN3')
        if idx == -1:
            return False
        
        self.scn3_start = idx + 8
        self.scn3_size = self.read_uint32(idx + 4)
        self.data_offset = self.read_uint32(self.scn3_start + 8)
        
        return True
    
    def extract_room_transforms(self):
        """Extract the room-level transforms (furniture base positions)."""
        # These are at a known location in JOMO: 0x92B48
        # Pattern: [id=2: 4][flags: 4][scale: 12][pos: 12][extra: 4] = 36 bytes
        
        # Find room transforms by scanning for id=2 pattern
        search_start = self.scn3_start + self.data_offset
        search_end = min(search_start + 20000, len(self.data) - 36)
        
        for offset in range(search_start, search_end, 4):
            entry_id = self.read_uint32(offset)
            if entry_id != 2:
                continue
            
            flags = self.read_uint32(offset + 4)
            sx = self.read_float(offset + 8)
            sy = self.read_float(offset + 12)
            sz = self.read_float(offset + 16)
            px = self.read_float(offset + 20)
            py = self.read_float(offset + 24)
            pz = self.read_float(offset + 28)
            
            # Validate
            if abs(sx - 1.0) < 0.2 and abs(sy - 1.0) < 0.2 and abs(sz - 1.0) < 0.2:
                if all(-100 < v < 100 for v in [px, py, pz]):
                    self.room_transforms.append(Transform(
                        position=(px, py, pz),
                        scale=(sx, sy, sz)
                    ))
        
        return len(self.room_transforms)
    
    def find_furniture_models(self) -> List[Tuple[int, str]]:
        """Find furniture model references (groups of consecutive $NAME.MT5 strings)."""
        pattern = rb'\$[A-Z0-9_]+\.MT5'
        models = []
        
        for m in re.finditer(pattern, self.data):
            name = m.group(0)[1:].decode('ascii')
            models.append((m.start(), name))
        
        # Group consecutive models
        groups = []
        current_group = []
        prev_end = 0
        
        for off, name in models:
            if current_group and off - prev_end > 32:
                if len(current_group) > 5:  # Only groups with multiple items
                    groups.append(current_group)
                current_group = []
            current_group.append((off, name))
            prev_end = off + len(name) + 5
        
        if len(current_group) > 5:
            groups.append(current_group)
        
        # Return the furniture group (likely the largest group of consecutive models)
        if groups:
            furniture_group = max(groups, key=len)
            return furniture_group
        return []
    
    def extract_object_definitions(self, furniture_start_offset: int):
        """Extract object definitions with relative transforms."""
        # Object definitions are in the ~3KB before the model string table
        # Pattern: scattered IDs (0-47) with optional [x, y, z] floats
        
        search_start = max(furniture_start_offset - 4000, self.scn3_start)
        
        object_defs = {}  # id -> relative transform
        
        for offset in range(search_start, furniture_start_offset, 4):
            val = self.read_uint32(offset)
            
            # Valid ID (0-50)?
            if val >= 50:
                continue
            
            # Check if there are floats after
            try:
                fx = self.read_float(offset + 4)
                fy = self.read_float(offset + 8)
                fz = self.read_float(offset + 12)
                
                # Valid small floats?
                valid = all(-10 < v < 10 for v in [fx, fy, fz])
                has_values = any(abs(v) > 0.001 for v in [fx, fy, fz])
                
                if valid and has_values:
                    if val not in object_defs:
                        object_defs[val] = Transform(position=(fx, fy, fz))
            except:
                pass
        
        return object_defs
    
    def analyze(self):
        """Run full analysis."""
        print("=" * 60)
        print("FURNITURE PLACEMENT EXTRACTOR v2")
        print("=" * 60)
        print(f"File: {self.path}")
        print()
        
        if not self.find_scn3():
            print("ERROR: Could not find SCN3 section")
            return False
        
        # Extract room transforms
        room_count = self.extract_room_transforms()
        print(f"Found {room_count} room transforms")
        
        # Find furniture models
        furniture_models = self.find_furniture_models()
        print(f"Found {len(furniture_models)} furniture models")
        
        if not furniture_models:
            return True
        
        furniture_start = furniture_models[0][0]
        
        # Extract object definitions
        object_defs = self.extract_object_definitions(furniture_start)
        print(f"Found {len(object_defs)} object definitions with transforms")
        
        # Create furniture objects
        for idx, (offset, name) in enumerate(furniture_models):
            obj = FurnitureObject(
                index=idx,
                model=name
            )
            
            # Check if this object has a relative transform
            if idx in object_defs:
                obj.relative_transform = object_defs[idx]
            
            self.furniture_objects.append(obj)
        
        # Try to assign absolute positions
        # For now, use a simple heuristic: group objects by prefix
        self._assign_parent_transforms()
        
        return True
    
    def _assign_parent_transforms(self):
        """Attempt to assign parent transforms to furniture objects."""
        # Group models by prefix (e.g., THKK, DHKK, BHKI, etc.)
        # Same prefix = same furniture piece
        
        prefix_groups = {}
        for obj in self.furniture_objects:
            # Extract prefix (first 4 chars)
            prefix = obj.model[:4]
            if prefix not in prefix_groups:
                prefix_groups[prefix] = []
            prefix_groups[prefix].append(obj)
        
        print(f"\nFurniture groups by prefix: {len(prefix_groups)}")
        
        # Assign room transforms to groups (simple assignment)
        if len(self.room_transforms) >= len(prefix_groups):
            for i, (prefix, objs) in enumerate(prefix_groups.items()):
                if i < len(self.room_transforms):
                    parent_pos = self.room_transforms[i].position
                    for obj in objs:
                        if obj.relative_transform:
                            rel = obj.relative_transform.position
                            obj.absolute_position = (
                                parent_pos[0] + rel[0],
                                parent_pos[1] + rel[1],
                                parent_pos[2] + rel[2]
                            )
                        else:
                            obj.absolute_position = parent_pos
    
    def print_summary(self):
        """Print extraction summary."""
        print(f"\n{'='*60}")
        print("EXTRACTION SUMMARY")
        print(f"{'='*60}")
        
        print(f"\nRoom transforms ({len(self.room_transforms)}):")
        for i, t in enumerate(self.room_transforms[:10]):
            print(f"  {i:3d}: ({t.position[0]:7.2f}, {t.position[1]:7.2f}, {t.position[2]:7.2f})")
        if len(self.room_transforms) > 10:
            print(f"  ... and {len(self.room_transforms) - 10} more")
        
        print(f"\nFurniture objects with transforms ({len([o for o in self.furniture_objects if o.relative_transform])}):")
        for obj in self.furniture_objects:
            if obj.relative_transform:
                rel = obj.relative_transform.position
                abs_pos = obj.absolute_position or (0, 0, 0)
                print(f"  {obj.model:18s}: rel=({rel[0]:6.2f}, {rel[1]:6.2f}, {rel[2]:6.2f})")
                if obj.absolute_position:
                    print(f"                    abs=({abs_pos[0]:6.2f}, {abs_pos[1]:6.2f}, {abs_pos[2]:6.2f})")
    
    def get_json_output(self) -> dict:
        """Get JSON-serializable output."""
        return {
            'file': self.path,
            'room_transforms': [
                {'position': list(t.position), 'scale': list(t.scale)}
                for t in self.room_transforms
            ],
            'furniture_objects': [
                {
                    'index': obj.index,
                    'model': obj.model,
                    'relative_transform': list(obj.relative_transform.position) if obj.relative_transform else None,
                    'absolute_position': list(obj.absolute_position) if obj.absolute_position else None
                }
                for obj in self.furniture_objects
            ],
            'summary': {
                'room_transforms': len(self.room_transforms),
                'furniture_objects': len(self.furniture_objects),
                'with_transforms': len([o for o in self.furniture_objects if o.relative_transform])
            }
        }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Extract furniture placements from Shenmue MAPINFO.BIN files'
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
    
    try:
        extractor = FurnitureExtractor(args.file)
        
        if not extractor.analyze():
            sys.exit(1)
        
        extractor.print_summary()
        
        # Save JSON output
        zone = os.path.basename(os.path.dirname(args.file))
        output_path = os.path.join(args.output, f"furniture_{zone}.json")
        
        os.makedirs(args.output, exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(extractor.get_json_output(), f, indent=2)
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
