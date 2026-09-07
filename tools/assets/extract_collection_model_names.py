#!/usr/bin/env python3
"""Extract Shenmue's English names for collection model resources.

The US Dreamcast executable contains a packed string table whose records are:

    <resource code>\0<English display name>\0

Collection model filenames add a final render/type suffix to that resource code.
For example, GACIAK1 maps to MODEL/ITEM/GACIAK1G.MT5.

This tool joins the executable table to the web viewer's models.json and writes
the complete audit used by the asset viewer. Alternate-size models retain
documented counterpart names with a distinct machine-readable status, but are
not shown in the viewer's primary collection list.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


TABLE_START = b"GACIAK1\x00Akira 1\x00"
TABLE_END = b"MT2K6GO\x00GOGO\x00"
RESOURCE_CODE = re.compile(r"^[A-Z0-9_]{7,8}$")

# GACK6SP occurs inside the executable's collection table but, uniquely, has
# no display string before the next resource record. Complete Shenmue I
# collection lists contain one otherwise-unmatched model prize, Space Harrier.
# The SP resource suffix corroborates that identification. Preserve the
# distinction from names read directly out of the executable.
CROSS_REFERENCED_NAMES = {
    "GACK6SP": {
        "displayName": "Space Harrier",
        "evidence": (
            "Unnamed resource in the executable collection table; matched to "
            "the otherwise-unrepresented Space Harrier raffle toy in complete "
            "Shenmue I collection lists."
        ),
    },
}

# These models have no display-name record of their own, but their resource
# families and MT5 structure pair them with named collection models. They are
# alternate-size copies rather than additional collection entries.
ALTERNATE_SIZE_MODELS = {
    "GACGJJ1": ("Jeffry 1 (Alternate)", "GACGJF1"),
    "GACGJJ2": ("Jeffry 2 (Alternate)", "GACGJF2"),
    "GACGSHP": ("SHENMUEcontainer (Alternate)", "GACGSHE"),
    "GACGTXX": ("Truck 1 (Alternate)", "GACGTRX"),
    "GACH5RR": ("Hot Dog Truck (Alternate)", "GACH5TR"),
    "GACH5TT": ("Truck 4 (Alternate)", "GACH5TK"),
    "GACIAA1": ("Akira 1 (Alternate)", "GACIAK1"),
    "GACIAA2": ("Akira 2 (Alternate)", "GACIAK2"),
    "GACK6BK": ("Motor Scooter (Alternate)", "GACH5BK"),
    "GACK6DS": ("Hornet (Alternate)", "GACK6DY"),
    "GACK6TS": ("TRY-Z (Alternate)", "GACK6TZ"),
    "GACK6XO": ("Hang On 1 (Alternate)", "GACK6HO"),
    "GACK6XH": ("Hang On 2 (Alternate)", "GACK6HH"),
    "GACK6XY": ("Hang On 3 (Alternate)", "GACK6HY"),
    "GACK6XB": ("Hang On 4 (Alternate)", "GACK6HB"),
    "GACK6XG": ("Hang On 5 (Alternate)", "GACK6HG"),
    "GACK6XK": ("Hang On G (Alternate)", "GACK6HK"),
    "GACOKK1": ("Wagon 1 (Alternate)", "GACO1K1"),
    "GACOKK2": ("Coupe'1 (Alternate)", "GACO1K2"),
    "GACOKK3": ("Coupe'2 (Alternate)", "GACO1K3"),
    "GACOKK4": ("Wagon 2 (Alternate)", "GACO1K4"),
    "GACOKK5": ("Wagon 3 (Alternate)", "GACO1K5"),
    "GACOKK6": ("Wagon 4 (Alternate)", "GACO1K6"),
    "GACOKK7": ("Coupe'3 (Alternate)", "GACO1K7"),
    "GACOKK8": ("Coupe'4 (Alternate)", "GACO1K8"),
    "GACOKK9": ("Coupe'5 (Alternate)", "GACO1K9"),
    "GACOTT1": ("Truck 2 (Alternate)", "GACO1T1"),
    "GACOTT2": ("Truck 3 (Alternate)", "GACO1T2"),
    "GACR0GG": ("Gear-o (Alternate)", "GACRGGG"),
    "GACRAXX": ("Alex Kidd (Alternate)", "GACRARX"),
    "GACRFNN": ("Fang (Alternate)", "GACRFNG"),
    "GACRPPN": ("Poppors (Alternate)", "GACRPOP"),
    "GACRRBB": ("ROBO (Alternate)", "GACRROB"),
    "GACS5BB": ("Bus (Alternate)", "GACS5BS"),
}


def printable_strings(data: bytes, start: int, end: int) -> list[tuple[int, str]]:
    strings: list[tuple[int, str]] = []
    cursor = start
    while cursor < end:
        if 0x20 <= data[cursor] < 0x7F:
            string_end = cursor
            while string_end < end and 0x20 <= data[string_end] < 0x7F:
                string_end += 1
            strings.append((cursor, data[cursor:string_end].decode("ascii")))
            cursor = string_end + 1
        else:
            cursor += 1
    return strings


def extract_name_table(executable: Path) -> tuple[dict[str, dict[str, object]], int, int]:
    data = executable.read_bytes()
    start = data.find(TABLE_START)
    if start < 0:
        raise ValueError(f"collection table start marker not found in {executable}")

    end_marker = data.find(TABLE_END, start)
    if end_marker < 0:
        raise ValueError(f"collection table end marker not found in {executable}")
    # MT2K6GO/GOGO begins the cassette records which follow the collection
    # models, so it is a boundary marker and is not part of this extraction.
    end = end_marker

    strings = printable_strings(data, start, end)
    records: dict[str, dict[str, object]] = {}
    for index, (offset, value) in enumerate(strings):
        if not RESOURCE_CODE.fullmatch(value):
            continue
        if index + 1 >= len(strings):
            continue
        _, candidate_name = strings[index + 1]
        if RESOURCE_CODE.fullmatch(candidate_name):
            # The executable includes GACK6SP without a following display name.
            continue
        records[value] = {
            "displayName": candidate_name,
            "executableOffset": offset,
        }
    return records, start, end


def model_resource_code(filename: str) -> str:
    stem = filename.removeprefix("G_ITEM_").removesuffix(".MT5")
    # MT5 item filenames append a one-character graphics/model suffix.
    return stem[:-1]


def build_audit(executable: Path, models_json: Path) -> dict[str, object]:
    names, table_start, table_end = extract_name_table(executable)
    model_filenames = json.loads(models_json.read_text(encoding="utf-8"))
    item_models = sorted(
        filename
        for filename in model_filenames
        if filename.startswith("G_ITEM_") and filename.endswith(".MT5")
    )

    items: dict[str, dict[str, object]] = {}
    direct_name_count = 0
    cross_referenced_count = 0
    alternate_size_count = 0
    for filename in item_models:
        resource_code = model_resource_code(filename)
        record = names.get(resource_code)
        if record:
            direct_name_count += 1
            items[filename] = {
                "resourceCode": resource_code,
                "displayName": record["displayName"],
                "status": "collection-table",
                "executableOffset": record["executableOffset"],
            }
        elif resource_code in CROSS_REFERENCED_NAMES:
            cross_referenced_count += 1
            cross_reference = CROSS_REFERENCED_NAMES[resource_code]
            items[filename] = {
                "resourceCode": resource_code,
                "displayName": cross_reference["displayName"],
                "status": "cross-referenced",
                "executableOffset": data_offset(executable, resource_code),
                "evidence": cross_reference["evidence"],
            }
        elif resource_code in ALTERNATE_SIZE_MODELS:
            alternate_size_count += 1
            display_name, based_on_resource = ALTERNATE_SIZE_MODELS[resource_code]
            items[filename] = {
                "resourceCode": resource_code,
                "displayName": display_name,
                "status": "alternate-size-model",
                "executableOffset": None,
                "basedOnResourceCode": based_on_resource,
                "evidence": (
                    "Alternate-size model paired by resource family and matching "
                    "MT5 structure; not an additional authored collection entry."
                ),
            }
        elif filename.startswith("G_ITEM_GAC"):
            items[filename] = {
                "resourceCode": resource_code,
                "displayName": None,
                "status": "uncatalogued-gac-asset",
                "executableOffset": None,
            }

    uncatalogued_count = sum(
        record["status"] == "uncatalogued-gac-asset"
        for record in items.values()
    )
    return {
        "schema": "shenmue-collection-model-names-v2",
        "source": {
            "description": "English collection resource/name table in the US Dreamcast 1ST_READ.BIN",
            "executable": executable.name,
            "tableStart": table_start,
            "tableEnd": table_end,
        },
        "counts": {
            "models": len(items),
            "collectionTableNames": direct_name_count,
            "crossReferencedNames": cross_referenced_count,
            "alternateSizeModels": alternate_size_count,
            "uncataloguedGacAssets": uncatalogued_count,
        },
        "items": items,
    }


def data_offset(executable: Path, resource_code: str) -> int | None:
    offset = executable.read_bytes().find(resource_code.encode("ascii"))
    return offset if offset >= 0 else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable",
        type=Path,
        default=Path(".disc-work/exact/1ST_READ.BIN"),
    )
    parser.add_argument(
        "--models",
        type=Path,
        default=Path("public/models.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/data/collection-model-names.json"),
    )
    args = parser.parse_args()

    audit = build_audit(args.executable, args.models)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    counts = audit["counts"]
    print(
        f"Wrote {args.output}: "
        f"{counts['collectionTableNames']} named, "
        f"{counts['crossReferencedNames']} cross-referenced, "
        f"{counts['alternateSizeModels']} alternate-size, "
        f"{counts['uncataloguedGacAssets']} uncatalogued"
    )


if __name__ == "__main__":
    main()
