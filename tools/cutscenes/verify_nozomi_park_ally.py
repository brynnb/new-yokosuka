#!/usr/bin/env python3
"""Verify the retail JU00 care arithmetic and JD00's optional park input."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = 0x0C010000
SOURCES = {
    "executable": (".disc-work/exact/1ST_READ.BIN", "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"),
    "JU00": ("extracted_files/data/SCENE/01/JU00/MAPINFO.BIN", "3887bbf6e00eb152f7cca34d23841cc743ee7345a2db6b7d27e8303f6274924d"),
    "DCBN": ("extracted_files/data/SCENE/01/DCBN/MAPINFO.BIN", "2af6d72477e1bd9026fbf3e551dc7550857e0ae0e68191164c203b2297dce8ee"),
    "JOMO": ("extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN", "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"),
    "JD00": ("extracted_files/data/SCENE/01/JD00/MAPINFO.BIN", "8582ed57e13593d7622d24216ef8f93e5393b13fffd2132f70500f9e6ce2a43b"),
}
EVIDENCE = ROOT / "tools/evidence/nozomi-park-ally-native.json"


def word(data, offset):
    return struct.unpack_from("<H", data, offset)[0]


def care_call(data, address):
    amount = word(data, address)
    target_load = word(data, address + 4)
    assert amount >> 8 == 0xE4 and word(data, address + 2) == 0x2D46
    assert target_load >> 8 == 0xD1 and word(data, address + 6) == 0x0103
    pool = ((address + 4) & ~3) + 4 + 4 * (target_load & 255)
    assert address + 10 + struct.unpack_from("<i", data, pool)[0] == 0x36FA2
    return amount & 255


def verify():
    data = {}
    for key, (path, expected) in SOURCES.items():
        data[key] = (ROOT / path).read_bytes()
        if hashlib.sha256(data[key]).hexdigest() != expected:
            raise ValueError("Unexpected retail source: " + path)
    exe, ju, jd = data["executable"], data["JU00"], data["JD00"]

    state_base = struct.unpack_from("<I", exe, 0x0C151660 - BASE)[0]
    load = word(exe, 0x0C151968 - BASE)
    store = word(exe, 0x0C151964 - BASE)
    assert load & 0xFFF0 == 0x85E0 and store & 0xFFF0 == 0x81E0
    assert load & 15 == store & 15
    address = state_base + 2 * (load & 15)
    assert address == 0x0C220A56
    # @(+8, peripheral) -> swapped holds at port+4 -> event+8 -> 0x0031(0).
    for offset, expected in [
        (0x0C136DDA, "42 56 6d 67 73 63 73 60 2c 43 18 40 3b 20 52 81"),
        (0x0C136DFC, "4c 85"), (0x0C136E18, "32 85 80 cb 32 81"),
        (0x0C136E28, "4d 85"), (0x0C136E46, "32 85 40 cb 32 81"),
        (0x0C13744C, "32 85 e4 81"), (0x0C137482, "43 60 0b 00 04 70"),
        (0x0C16B506, "11 a0 42 85"),
    ]:
        check = bytes.fromhex(expected)
        assert exe[offset-BASE:offset-BASE+len(check)] == check

    foods = {}
    for test, target in [(0x27D72, 0x27D90), (0x27F10, 0x27F2C), (0x28070, 0x2808C),
                         (0x281D0, 0x281EC), (0x28330, 0x2834C), (0x28490, 0x284AC)]:
        operand = word(ju, test)
        assert operand >> 8 == 0xE5 and word(ju, test + 2) == 0x3450
        branch = word(ju, test + 10)
        assert branch >> 8 == 0x8B and test + 14 + 2 * (branch & 255) == target
        item = operand & 255
        # Five-word retail item entry. The fourth word points to its English name.
        pointer = struct.unpack_from("<I", exe, 0x279554 + 20 * item + 12)[0] - BASE
        label = exe[pointer:exe.index(b"\0", pointer)].decode("ascii")
        foods[label] = {"item": item, "points": care_call(ju, target), "call": hex(target + 6)}
    assert foods["Milk"]["points"] == 25 and foods["Dried Fish"]["points"] == 15
    assert ju[0x36FEC:0x36FF4] == bytes.fromhex("e0 55 e3 56 6c 35 52 24")
    other = [{"call": hex(pos+6), "points": care_call(ju, pos)} for pos in (0x2B3C0, 0x2C8EA, 0x2D05E)]

    # Each supermarket checkout row stores its retail item ID in the seventh
    # 32-bit word. Prices are keyed by that same four-byte product tag.
    shop = data["DCBN"]
    checkout = []
    labels = {row["item"]: label for label, row in foods.items()}
    for i, (tag, expected_item, expected_price) in enumerate([
        ("cntk", 61, 180), ("cnnp", 60, 300), ("cnmp", 58, 500), ("cnmk", 59, 100),
    ]):
        row_at, price_at = 0x2A5A0 + i*32, 0x2AA9C + i*8
        price_tag, price = struct.unpack_from("<4sI", shop, price_at)
        item = struct.unpack_from("<I", shop, row_at + 24)[0]
        assert shop[row_at+4:row_at+8] == price_tag == tag.encode("ascii")
        assert (item, price) == (expected_item, expected_price)
        checkout.append({"tag": tag, "item": item, "label": labels[item], "yen": price,
                         "productRow": hex(row_at), "priceRow": hex(price_at)})
    assert shop[0x1B226:0x1B230] == bytes.fromhex("08 e6 67 05 1a 05 06 e6 6c 35")
    assert shop[0x1B606:0x1B61C] == bytes.fromhex(
        "00 e5 01 e6 eb 57 46 2d 56 2d 66 2d 76 2d 3d e5 8a 50 8d 54 0b 40")
    kitchen = data["JOMO"]
    assert kitchen[0x86D20:0x86D38] == bytes.fromhex(
        "00 e4 00 e5 03 e6 3c e7 46 2d 56 2d 66 2d 76 2d 3d e5 8a 50 8d 54 0b 40")

    table = list(struct.unpack_from("<8i", jd, 0x81468))
    assert table == [2, 2, 512, 4, 1024, 1024, 1024, -1]
    assert word(jd, 0x7603A) == 0xE505 and word(jd, 0x7603C) == 0x3457
    for call in (0x7620C, 0x7692E):
        # Both approaches compare the query result against the exact same 500.
        literal = word(jd, call+8)
        assert literal >> 8 == 0xD5 and word(jd, call+10) == 0x3453
        pool = ((call + 8) & ~3) + 4 + 4 * (literal & 255)
        assert struct.unpack_from("<I", jd, pool)[0] == 500
    return {
        "schema": "new-yokosuka-nozomi-park-ally-native-v1",
        "disc": 1, "sha256": {key:value[1] for key,value in SOURCES.items()},
        "care": {"signedAddress": hex(address), "writerMode": 43, "readerMode": 44,
                 "JU00Adder":"0x36fa2", "foods": foods, "otherJU00Calls":other},
        "TomatoDCBN": {"checkoutStock": checkout, "giveOneCall":"0x1b61a"},
        "HazukiKitchenJOMO": {"driedFishItem":60, "quantity":3, "grantCall":"0x86d36"},
        "park": {"approachGateCalls":["0x7620c","0x7692e"], "minimumCare":500,
                 "child":"0x75d54", "data":"0x81468", "rawInputTable":table,
                 "unfinishedTimeoutAfterTicks":5, "roomFlag":"0x4f4"},
        "controls":{"heldCache":"0x0c21d9bc","physicalInputEvidence":"nozomi-park-ally-controller-2026-11-25.json"},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = json.dumps(verify(), indent=2) + "\n"
    if args.check:
        if result != EVIDENCE.read_text():
            parser.exit(1, "Nozomi park native evidence is stale\n")
    else:
        EVIDENCE.write_text(result)
