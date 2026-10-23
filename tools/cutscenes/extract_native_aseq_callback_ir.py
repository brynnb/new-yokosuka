#!/usr/bin/env python3
"""Extract one compiled ASEQ callback from the complete native-event IR."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"


def read_native_map(path: Path, disc: int, area: str, entry: str) -> dict:
    """Read one map from the canonical pretty-printed IR without loading 850+ MiB.

    The compiler writes the top-level maps array with indent=2. JSONDecoder
    handles each complete record (including escaped braces/strings); formatting
    is used only to locate the top-level array, never to split its records.
    """
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.rstrip() == '  "maps": [':
                break
        else:
            raise RuntimeError("canonical native IR maps array is absent")
        decoder = json.JSONDecoder()
        buffer = ""
        eof = False
        while True:
            buffer = buffer.lstrip()
            if buffer.startswith(","):
                buffer = buffer[1:].lstrip()
            if buffer.startswith("]"):
                break
            if buffer:
                try:
                    value, end = decoder.raw_decode(buffer)
                except json.JSONDecodeError:
                    if eof:
                        raise
                else:
                    if (value["disc"] == disc and value["area"] == area.upper()
                            and value["entryFunction"] == entry.lower()):
                        return value
                    buffer = buffer[end:]
                    continue
            if eof:
                raise RuntimeError("native IR maps array is truncated")
            chunk = stream.read(1024 * 1024)
            eof = not chunk
            buffer += chunk
    raise RuntimeError("requested native map entry is absent from the IR")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--disc", required=True, type=int)
    parser.add_argument("--area", required=True)
    parser.add_argument("--map-entry", required=True)
    parser.add_argument("--callback", required=True)
    parser.add_argument("--include-function", action="append", default=[])
    parser.add_argument("--include-call-closure", action="store_true",
                        help="Include synchronous direct-call helpers of the selected functions")
    parser.add_argument("--include-coroutine-closure", action="store_true",
                        help="Also retain the selected callback's child effect/sound coroutines")
    parser.add_argument("--input", type=Path, default=DEFAULT_IR)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.input = args.input.resolve()

    native_map = read_native_map(args.input, args.disc, args.area, args.map_entry)
    with args.input.open("rb") as stream:
        input_sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
    callback = next((entry for entry in native_map["functions"] if (
        entry["id"] == args.callback.lower()
    )), None)
    if callback is None:
        raise RuntimeError("requested native callback is absent from the IR")

    result = {
        "schema": "new-yokosuka-native-aseq-callback-ir-v1",
        "generatedBy": "tools/cutscenes/extract_native_aseq_callback_ir.py",
        "source": {
            "path": str(args.input.relative_to(ROOT)),
            "sha256": input_sha256,
            "disc": args.disc,
            "area": args.area.upper(),
            "mapinfoSha256": native_map["mapinfoSha256"],
            "mapEntryFunction": args.map_entry.lower(),
            "callbackFunction": args.callback.lower(),
        },
        "function": callback,
    }
    if args.include_function or args.include_call_closure or args.include_coroutine_closure:
        functions = {entry["id"]: entry for entry in native_map["functions"]}
        included = {identifier.lower() for identifier in args.include_function}
        if args.include_call_closure or args.include_coroutine_closure:
            pending = [callback["id"], *included]
            visited = set()
            while pending:
                identifier = pending.pop()
                if identifier in visited:
                    continue
                visited.add(identifier)
                for block in functions[identifier]["blocks"]:
                    pending.extend(action["targetFileOffset"] for action in block["actions"]
                                   if action["kind"] == "directCall" or (
                                       args.include_coroutine_closure
                                       and action["kind"] == "childCoroutineLaunch"
                                       and action.get("targetFileOffset") in functions))
            included.update(visited - {callback["id"]})
        result["supportingFunctions"] = [functions[identifier] for identifier in
                                         sorted(included, key=lambda value: int(value, 16))]
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT) if output.is_relative_to(ROOT) else output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
