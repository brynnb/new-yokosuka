#!/usr/bin/env python3

import hashlib
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_scn3_container_encoding_evidence import (  # noqa: E402
    LEGACY_MARKER,
    NATIVE_MARKER,
    NATIVE_THUNK_LENGTH,
    NATIVE_THUNK_SHA256,
    classify_container,
    prove_constructor,
)


def token(marker, entry, *, thunk=b"", entry_bytes=b"\x13\x00\x70\x41"):
    size = 0x90
    data = bytearray(size)
    data[:4] = b"SCN3"
    struct.pack_into("<I", data, 4, size)
    struct.pack_into("<I", data, 8, marker)
    struct.pack_into("<I", data, 0x0C, entry)
    struct.pack_into("<I", data, 0x10, 0x80)
    data[0x30:0x30 + len(thunk)] = thunk
    data[entry:entry + len(entry_bytes)] = entry_bytes
    return bytes(data)


class Scn3ContainerEncodingEvidenceTest(unittest.TestCase):
    def test_classifies_legacy_nonempty_program_without_native_prologue(self):
        result = classify_container(token(LEGACY_MARKER, 0x38))
        self.assertEqual(
            result["classification"],
            "legacy-instruction-stream-scn3-program",
        )
        self.assertEqual(result["encodingDiscriminatorByte"], 0)
        self.assertEqual(result["programByteLength"], 0x48)
        self.assertFalse(result["generatedNativeEntryPrologue"])
        self.assertEqual(result["nestedScn3FileOffsets"], [])

    def test_classifies_exact_native_thunk_and_entry_prologue(self):
        # Classification deliberately pins the whole generated thunk hash,
        # not merely a plausible-looking SH-4 instruction prefix.
        fixture = bytearray(token(NATIVE_MARKER, 0x60))
        fixture[0x30:0x30 + NATIVE_THUNK_LENGTH] = b"x" * NATIVE_THUNK_LENGTH
        self.assertNotEqual(
            hashlib.sha256(fixture[0x30:0x30 + NATIVE_THUNK_LENGTH]).hexdigest(),
            NATIVE_THUNK_SHA256,
        )
        result = classify_container(bytes(fixture))
        self.assertEqual(result["classification"], "native-scn3-extraction-anomaly")
        self.assertTrue(result["generatedNativeEntryPrologue"] is False)

    def test_distinguishes_absent_and_multiple_scn3_tokens(self):
        self.assertEqual(
            classify_container(b"ATTR\x08\x00\x00\x00")["classification"],
            "asset-only-no-scn3-program",
        )
        result = classify_container(token(LEGACY_MARKER, 0x38) + b"SCN3")
        self.assertEqual(
            result["classification"],
            "multiple-top-level-scn3-containers",
        )
        self.assertEqual(result["scn3TokenCount"], 2)

    def test_identifies_a_literal_nested_scn3_token_within_outer_bounds(self):
        fixture = bytearray(token(LEGACY_MARKER, 0x38))
        fixture[0x70:0x74] = b"SCN3"
        result = classify_container(bytes(fixture))
        self.assertEqual(result["classification"], "nested-scn3-container")
        self.assertEqual(result["nestedScn3FileOffsets"], ["0x70"])

    def test_rejects_malformed_native_bounds_before_calling_it_code(self):
        fixture = bytearray(token(NATIVE_MARKER, 0x60))
        struct.pack_into("<I", fixture, 0x10, 0x40)
        result = classify_container(bytes(fixture))
        self.assertEqual(result["classification"], "malformed-scn3-container")
        self.assertFalse(result["boundsValid"])


if __name__ == "__main__":
    unittest.main()
