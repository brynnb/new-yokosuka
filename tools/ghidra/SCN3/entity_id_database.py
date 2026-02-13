"""
Entity ID Database Builder
==========================
Scans all MAPINFO.BIN files across the game to build a comprehensive registry
of 4-character MAKE_ID tags (32-bit little-endian ASCII identifiers).

These tags identify NPCs, objects, and system entities in Shenmue's SCN3 VM.

Usage:
    python3 entity_id_database.py <scene_root> [output.json]

Example:
    python3 entity_id_database.py extracted_disc2_v2/data/SCENE entity_ids.json
"""

import struct
import json
import os
import sys
from collections import defaultdict


# ================================================================
# KNOWN CHARACTER/ENTITY NAMES
# Derived from SEQCONV.C, 0154_1.C, and runtime analysis
# ================================================================
KNOWN_ENTITIES = {
    "AKIR": {"name": "Ryo Hazuki",       "type": "NPC",    "alias": "ID_AKI",    "notes": "Player character (internal: Akira Yuki)"},
    "SARA": {"name": "Sara",              "type": "NPC",    "alias": "ID_SARA",   "notes": "Sara"},
    "TAIJ": {"name": "Tairaku",           "type": "NPC",    "alias": "ID_TAI",    "notes": "Tairaku"},
    "KISY": {"name": "Kisuya",            "type": "NPC",    "alias": "ID_KIS",    "notes": "Kisuya"},
    "CHIN": {"name": "Chai",              "type": "NPC",    "alias": "ID_CHI",    "notes": "Chai / Chinese character"},
    "INES": {"name": "Ine-san",           "type": "NPC",    "alias": "ID_INE",    "notes": "Ine-san (Ryo's grandmother)"},
    "FUKU": {"name": "Fuku-san",          "type": "NPC",    "alias": "ID_FUKU",   "notes": "Fuku-san (live-in student)"},
    "NOZA": {"name": "Nozomi",            "type": "NPC",    "alias": "ID_NOZA",   "notes": "Nozomi Harasaki"},
    "GUIY": {"name": "Gui Zhang",         "type": "NPC",    "alias": "ID_GUI",    "notes": "Gui Zhang Chen"},
    "LANT": {"name": "Lan Di",            "type": "NPC",    "alias": "ID_LAN",    "notes": "Lan Di (antagonist)"},
    "IWAO": {"name": "Iwao Hazuki",       "type": "NPC",    "alias": "ID_IWAO",   "notes": "Iwao Hazuki (Ryo's father)"},
    "TOMY": {"name": "Tom",               "type": "NPC",    "alias": "ID_TOM",    "notes": "Tom Johnson (hot dog vendor)"},
    "MARK": {"name": "Mark",              "type": "NPC",    "alias": "ID_MARK",   "notes": "Mark Kimberly (harbor worker)"},
    "GORO": {"name": "Goro",              "type": "NPC",    "alias": "ID_GORO",   "notes": "Goro (harbor foreman)"},
    "MEGU": {"name": "Megumi",            "type": "NPC",    "alias": "ID_MEGU",   "notes": "Megumi"},
    "ENOK": {"name": "Enoki",             "type": "NPC",    "alias": "ID_ENOK",   "notes": "Enoki"},
    "NEKO": {"name": "Cat",               "type": "ANIMAL", "alias": "ID_NEKO",   "notes": "Cat (various)"},
    "INUT": {"name": "Dog",               "type": "ANIMAL", "alias": "ID_INU",    "notes": "Dog"},
}

# Special non-ASCII IDs
SPECIAL_IDS = {
    0x285E5E3B: {"tag": "(^^;", "name": "Camera",  "type": "SYSTEM", "alias": "ID_CAMERA", "notes": "Camera sentinel (emoticon tag)"},
}

# Scene code -> human-readable name
SCENE_NAMES = {
    "JOMO": "Hazuki Residence Interior",
    "JD00": "Sakuragaoka",
    "JHD0": "Hazuki Exterior",
    "JU00": "Yamanose",
    "D000": "Dobuita Main Street",
    "MFSY": "Harbor (Amihama)",
    "MS08": "Warehouse 8",
    "MS8A": "Warehouse 8 (Alt)",
    "MS8S": "Warehouse 8 (Story)",
    "MK80": "Harbor Warehouse Area",
    "MKSG": "Harbor Storage",
    "MKYU": "Harbor Dock",
    "ARAR": "Abe Store",
    "BETD": "Bet District",
    "DAZA": "Dobuita Alley A",
    "DBHB": "Dobuita Barber",
    "DBYO": "Dobuita Bar Yokosuka",
    "DCBN": "Dobuita Convenience Store",
    "DCHA": "Dobuita China Shop",
    "DGCT": "Game Center (YOU Arcade)",
    "DJAZ": "Dobuita Jazz Bar",
    "DKPA": "Dobuita Knocking Parlor",
    "DKTY": "Dobuita Kitchen",
    "DMAJ": "Dobuita Mahjong Parlor",
    "DNOZ": "Dobuita Nozomi's House",
    "DPIZ": "Dobuita Pizza Parlor",
    "DRHT": "Dobuita Right Side",
    "DRME": "Dobuita Ramen Shop",
    "DRSA": "Dobuita RSA",
    "DSBA": "Dobuita Soba Shop",
    "DSKI": "Dobuita Ski Shop",
    "DSLI": "Dobuita Slot House",
    "DSLT": "Dobuita Slot House (Alt)",
    "DSUS": "Dobuita Sushi Shop",
    "DTKY": "Dobuita Tokyo",
    "DURN": "Dobuita Urine (Restroom)",
    "DYKZ": "Dobuita Yokosuka",
    "GMCT": "Game Center Interior",
    "JABE": "Abe Residence",
    "TATQ": "Tattoo Parlor",
}


def is_valid_make_id(data_bytes):
    """Check if 4 bytes form a valid MAKE_ID (4-char entity identifier).

    Real MAKE_ID tags in Shenmue follow the MAKE_ID('A','K','I','R') convention:
    all uppercase letters (occasionally with a digit). Examples: AKIR, FUKU, DOOR,
    INES, NEKO, SARA, CHIN, MS08, JD00.

    Strict filters to avoid binary/string fragment false positives.
    """
    try:
        tag = data_bytes.decode('ascii')
    except (UnicodeDecodeError, ValueError):
        return False

    if len(tag) != 4:
        return False

    # Each char must be uppercase letter or digit
    if not all(c.isupper() or c.isdigit() for c in tag):
        return False

    # At least 3 uppercase letters (filters pure numeric like "0000")
    upper_count = sum(1 for c in tag if c.isupper())
    if upper_count < 3:
        return False

    return True


def scan_mapinfo_for_ids(filepath):
    """Scan a MAPINFO.BIN file for all 4-byte MAKE_ID tags.

    Strategy:
    1. Scan the entire binary at every 4-byte alignment
    2. Look for 32-bit values that decode to valid 4-char ASCII tags
    3. Cross-reference with known entity names
    4. Track file offset for each occurrence
    """
    with open(filepath, 'rb') as f:
        data = f.read()

    found_ids = defaultdict(list)  # tag -> [offsets]

    def _is_id_char(b):
        """Check if byte is an uppercase letter or digit (MAKE_ID character)."""
        return (65 <= b <= 90) or (48 <= b <= 57)  # A-Z or 0-9

    # Scan at 4-byte alignment
    for i in range(0, len(data) - 3, 4):
        chunk = data[i:i+4]
        val = struct.unpack('<I', chunk)[0]

        # Check special IDs first
        if val in SPECIAL_IDS:
            tag = SPECIAL_IDS[val]["tag"]
            found_ids[tag].append(i)
            continue

        # Check if it's a valid ASCII MAKE_ID
        if is_valid_make_id(chunk):
            # Context check: reject if this tag is embedded in a longer
            # uppercase ASCII run (indicates it's a string fragment, not a standalone ID)
            before_is_id = (i > 0 and _is_id_char(data[i - 1]))
            after_is_id = (i + 4 < len(data) and _is_id_char(data[i + 4]))
            if before_is_id and after_is_id:
                continue  # Embedded in longer string — skip

            tag = chunk.decode('ascii')
            found_ids[tag].append(i)

    return dict(found_ids)


def scan_scene_directory(scene_root):
    """Recursively scan all MAPINFO.BIN files under a scene root directory."""
    all_results = {}
    global_registry = defaultdict(lambda: {"count": 0, "scenes": [], "offsets": {}})

    mapinfo_files = []
    for root, dirs, files in os.walk(scene_root):
        for f in files:
            if f == "MAPINFO.BIN":
                mapinfo_files.append(os.path.join(root, f))

    mapinfo_files.sort()
    print(f"Found {len(mapinfo_files)} MAPINFO.BIN files")

    for filepath in mapinfo_files:
        # Extract scene code from path (e.g., .../SCENE/02/JOMO/MAPINFO.BIN -> JOMO)
        parts = filepath.replace('\\', '/').split('/')
        scene_code = "UNKNOWN"
        for i, p in enumerate(parts):
            if p == "MAPINFO.BIN" and i > 0:
                scene_code = parts[i - 1]
                break

        scene_name = SCENE_NAMES.get(scene_code, scene_code)
        print(f"  Scanning {scene_code} ({scene_name})...")

        ids_found = scan_mapinfo_for_ids(filepath)

        scene_result = {
            "scene_code": scene_code,
            "scene_name": scene_name,
            "filepath": filepath,
            "entity_count": len(ids_found),
            "entities": {}
        }

        for tag, offsets in sorted(ids_found.items()):
            # Look up known info
            known = KNOWN_ENTITIES.get(tag, {})
            entry = {
                "tag": tag,
                "hex": f"0x{struct.unpack('<I', tag.encode('ascii'))[0]:08X}" if len(tag) == 4 and tag.isascii() else "special",
                "name": known.get("name", tag),
                "type": known.get("type", "UNKNOWN"),
                "alias": known.get("alias", f"ID_{tag}"),
                "occurrences": len(offsets),
                "offsets": [f"0x{o:X}" for o in offsets[:10]],  # Cap at 10 for readability
            }
            scene_result["entities"][tag] = entry

            # Update global registry
            global_registry[tag]["count"] += len(offsets)
            global_registry[tag]["scenes"].append(scene_code)
            global_registry[tag]["offsets"][scene_code] = len(offsets)

        all_results[scene_code] = scene_result

    return all_results, dict(global_registry)


def build_database(scene_root, output_path):
    """Build the complete entity ID database."""
    print(f"=== Entity ID Database Builder ===")
    print(f"Scanning: {scene_root}")

    scene_results, global_registry = scan_scene_directory(scene_root)

    # Build the master registry with enriched info
    master_registry = {}
    for tag, info in sorted(global_registry.items(), key=lambda x: -x[1]["count"]):
        known = KNOWN_ENTITIES.get(tag, {})
        special = None
        try:
            val = struct.unpack('<I', tag.encode('ascii'))[0]
            special = SPECIAL_IDS.get(val)
        except:
            pass

        entry = {
            "tag": tag,
            "name": known.get("name", special["name"] if special else tag),
            "type": known.get("type", special["type"] if special else "UNKNOWN"),
            "alias": known.get("alias", special["alias"] if special else f"ID_{tag}"),
            "notes": known.get("notes", special["notes"] if special else ""),
            "total_occurrences": info["count"],
            "scene_count": len(info["scenes"]),
            "scenes": sorted(set(info["scenes"])),
            "occurrences_per_scene": info["offsets"],
        }
        master_registry[tag] = entry

    # Build output
    output = {
        "metadata": {
            "tool": "entity_id_database.py",
            "scene_root": scene_root,
            "total_unique_ids": len(master_registry),
            "total_scenes_scanned": len(scene_results),
            "known_entities": len(KNOWN_ENTITIES),
        },
        "registry": master_registry,
        "per_scene": scene_results,
    }

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    # Print summary
    print(f"\n=== Summary ===")
    print(f"  Scenes scanned:    {len(scene_results)}")
    print(f"  Unique MAKE_IDs:   {len(master_registry)}")
    print(f"  Known entities:    {sum(1 for t in master_registry if t in KNOWN_ENTITIES)}")
    print(f"  Unknown entities:  {sum(1 for t in master_registry if t not in KNOWN_ENTITIES)}")
    print(f"  Output:            {output_path}")

    # Print top entities
    print(f"\n  Top 20 entities by occurrence:")
    for i, (tag, info) in enumerate(sorted(master_registry.items(), key=lambda x: -x[1]["total_occurrences"])[:20]):
        name = info["name"]
        count = info["total_occurrences"]
        scenes = info["scene_count"]
        print(f"    {i+1:3d}. {tag:6s} -> {name:20s}  ({count:4d} refs in {scenes:2d} scenes)")

    return output


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 entity_id_database.py <scene_root> [output.json]")
        print("  Scans all MAPINFO.BIN files for MAKE_ID entity tags.")
        print("")
        print("Example:")
        print("  python3 entity_id_database.py extracted_disc2_v2/data/SCENE entity_ids.json")
        sys.exit(1)

    scene_root = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "entity_id_database.json"

    build_database(scene_root, output_path)
