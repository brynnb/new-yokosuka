import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "native_free_conversation",
    ROOT / "tools/scripting/extract_dialogue_native_free_conversation.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeFreeConversationExtractorTests(unittest.TestCase):
    def test_verified_executable_exposes_free_conversation_dispatch(self):
        evidence = MODULE.verify_executable(
            MODULE.DEFAULT_EXECUTABLE.read_bytes()
        )
        self.assertEqual(evidence["sha256"], MODULE.EXECUTABLE_SHA256)
        self.assertEqual(
            evidence["verifiedCodeRanges"]["operationDispatch"][
                "runtimeAddress"
            ],
            "0xc1592e0",
        )
        self.assertEqual(
            evidence["verifiedCodeRanges"]["conversationStateMachine"]["size"],
            2974,
        )

    def test_native_person_schema_is_not_inferred_from_display_names(self):
        self.assertEqual(MODULE.RUNTIME_PERSON_SIZE, 0x78)
        self.assertEqual(MODULE.ROOM_PERSON_CAPACITY, 12)
        self.assertEqual(MODULE.DYNAMIC_PERSON_CAPACITY, 24)
        self.assertEqual(
            MODULE.STATIC_TO_RUNTIME_FIELDS[0],
            {
                "source": "+0x00 dword",
                "runtime": "+0x04",
                "meaning": "person identity",
            },
        )
        unresolved = [
            item
            for item in MODULE.STATIC_TO_RUNTIME_FIELDS
            if item["meaning"] == "numeric field"
        ]
        self.assertEqual(len(unresolved), 4)

    def test_suboperations_preserve_low_level_state_bank_scope(self):
        self.assertIn("free-conversation manager", MODULE.SUBOPERATIONS[0])
        self.assertEqual(
            MODULE.SUBOPERATIONS[11],
            "read state bank 2 at a 16-bit index",
        )
        self.assertIn("exact actor identity", MODULE.SUBOPERATIONS[7])


if __name__ == "__main__":
    unittest.main()
