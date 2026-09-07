import importlib.util
import pathlib
import struct
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "interaction_registration",
    ROOT / "tools/scripting/extract_dialogue_interaction_registration.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InteractionRegistrationExtractorTests(unittest.TestCase):
    def test_static_base_plus_literal_resolves_to_relative_pointer(self):
        instructions = [
            (0x10, "mov.l", "@(4,r8),r6", None),
            (0x12, "mov.l", "0x20,r1", 0x52EC),
            (0x14, "add", "r1,r6", None),
        ]
        self.assertEqual(
            MODULE.resolve_register(instructions, "r6", 3, 0),
            {
                "kind": "static-pointer",
                "relativeOffset": 0x52EC,
                "relativeOffsetHex": "0x52ec",
                "sourceFileOffset": "0x14",
            },
        )

    def test_only_proven_primary_stride_is_serialized(self):
        data = bytearray(10 * 13 * 4)
        for index, value in enumerate(range(10)):
            struct.pack_into("<I", data, index * 13 * 4, value)
        result = MODULE.serialize_static_input(
            bytes(data),
            0,
            MODULE.static_pointer(0),
            probe_strided_words=True,
        )
        self.assertEqual(
            [
                probe["value"]
                for probe in result["provenSetupRead"]["probes"]
            ],
            list(range(10)),
        )
        self.assertNotIn("records", result)


if __name__ == "__main__":
    unittest.main()
