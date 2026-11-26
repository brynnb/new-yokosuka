"""Extract the Dobuita DEFB presentation calls from the original room's compiled IR."""
import hashlib
import json
import struct
from pathlib import Path

from tools.cutscenes.extract_native_aseq_callback_ir import DEFAULT_IR, ROOT, iter_native_maps

OWNERS = {"intro": "0x64f74", "defeat": "0x67508", "win": "0x666b0"}
HELPERS = {
    "0x62ef8": "camera", "0x63062": "voice", "0x634c0": "motion",
    "0x63614": "place", "0x63810": "turn", "0x63c98": "rotateTicks",
}
OUTPUT = ROOT / "tools/evidence/d000-enoki-revenge-director.json"


def motion_arguments(room, call):
    """Read the two literal-pool-interrupted SH-4 argument lists from the original bytes."""
    registers = {}
    pushed = []
    for pc in range(call - 26, call, 2):
        word = struct.unpack_from("<H", room, pc)[0]
        register = (word >> 8) & 15
        if word >> 12 == 0xE:
            registers[register] = ((word & 255) - (256 if word & 128 else 0)) & 0xffffffff
        elif word >> 12 == 0xD:
            target = ((pc + 4) & ~3) + 4 * (word & 255)
            registers[register] = struct.unpack_from("<I", room, target)[0]
        elif word & 0xff0f == 0x2d06:
            pushed.append(registers[(word >> 4) & 15])
        else:
            raise ValueError(f"Unexpected motion instruction {word:x} at {pc:x}")
    if len(pushed) != 6 or struct.unpack_from("<H", room, call)[0] != 0x0103:
        raise ValueError("Changed DEFB motion call")
    return list(reversed(pushed))


def extract():
    area = next(m for m in iter_native_maps(DEFAULT_IR)
                if m["disc"] == 1 and m["area"] == "D000")
    functions = {f["id"]: f for f in area["functions"]}
    source = Path("extracted_files/data/SCENE/01/D000/MAPINFO.BIN")
    room = (ROOT / source).read_bytes()
    stages = {}
    for stage, owner in OWNERS.items():
        calls = []
        for block in functions[owner]["blocks"]:
            for action in block["actions"]:
                target = action.get("targetFileOffset")
                if action["kind"] != "directCall" or target not in HELPERS:
                    continue
                args = action.get("arguments", [])
                # A call with a frame-derived argument is retained as unresolved.
                # Do not substitute some other actor or motion.
                words = [arg.get("value") for arg in args]
                if not words and HELPERS[target] == "motion":
                    words = motion_arguments(room, int(action["callFileOffset"], 16))
                calls.append([action["callFileOffset"], HELPERS[target], words])
        stages[stage] = {"owner": owner, "calls": sorted(calls, key=lambda c: int(c[0], 16))}
    return {"schema": "new-yokosuka-enoki-revenge-director-v1", "source": str(source),
            "mapinfoSha256": hashlib.sha256(room).hexdigest(), "helpers": HELPERS, "stages": stages}


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(extract(), indent=2) + "\n")
