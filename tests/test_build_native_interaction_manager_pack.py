#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.build_native_interaction_manager_pack import build_pack  # noqa: E402


class NativeInteractionManagerPackTest(unittest.TestCase):
    def fixture(self):
        return {
            "schema": "new-yokosuka-dialogue-native-interaction-manager-v1",
            "summary": {
                "descriptorRecordCount": 2,
                "indirectReferenceCount": 3,
            },
            "registrations": [{
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": "a" * 64,
                "setupFunction": "0x100",
                "callFileOffset": "0x200",
                "descriptorTable": {"records": [
                    {"indirectRecordIndices": [4, 7]},
                    {"indirectRecordIndices": [7]},
                ]},
                "indirectRecordTable": {"records": [
                    {"index": 4, "words": [1, 9, 0, 0, 0, 11, 12, 13, 0]},
                    {"index": 7, "words": [2, 8, 0, 0, 0, 21, 22, 23, 0]},
                ]},
            }],
        }

    def test_retains_only_exact_lookup_inputs(self):
        pack = build_pack(self.fixture(), "b" * 64)
        self.assertEqual(pack["summary"], {
            "managerCount": 1,
            "descriptorCount": 2,
            "indirectReferenceCount": 3,
        })
        self.assertEqual(pack["managers"][0]["descriptorSequences"], [
            [4, 7], [7],
        ])
        self.assertEqual(pack["managers"][0]["indirectRecords"], [
            {"index": 4, "key": 1, "vectorWords": [11, 12, 13]},
            {"index": 7, "key": 2, "vectorWords": [21, 22, 23]},
        ])

    def test_rejects_duplicate_source_identity(self):
        report = self.fixture()
        report["registrations"].append(report["registrations"][0])
        report["summary"]["descriptorRecordCount"] = 4
        report["summary"]["indirectReferenceCount"] = 6
        with self.assertRaisesRegex(ValueError, "duplicate"):
            build_pack(report, "b" * 64)


if __name__ == "__main__":
    unittest.main()
