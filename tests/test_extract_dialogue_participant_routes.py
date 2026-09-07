from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))
SPEC = importlib.util.spec_from_file_location(
    "extract_dialogue_participant_routes",
    TOOLS / "scripting/extract_dialogue_participant_routes.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueParticipantRouteExtractorTests(unittest.TestCase):
    def test_table_route_preserves_native_ordinals(self):
        self.assertEqual(MODULE.table_route(0x32), {
            "participantTableIndex": 1,
            "behavior": "participantControlDispatch",
            "handlerAddress": "0xc16175c",
        })
        self.assertEqual(
            MODULE.table_route(0x3B)["participantTableIndex"],
            10,
        )
        self.assertEqual(MODULE.table_route(0x8C), {
            "participantTableIndex": 1,
            "behavior": "selectedParticipantWrite",
            "selectedParticipantAddress": "0xc2243a0",
            "selectedParticipantFlagAddress": "0xc224370",
        })
        self.assertEqual(
            MODULE.table_route(0x95)["participantTableIndex"],
            10,
        )
        self.assertIsNone(MODULE.table_route(0x31))

    def test_report_counts_routes_without_inventing_missing_participants(self):
        executable = bytearray(0x170000)
        original_sha = MODULE.EXECUTABLE_SHA256
        original_ranges = MODULE.VERIFIED_RANGES
        try:
            MODULE.EXECUTABLE_SHA256 = __import__(
                "hashlib"
            ).sha256(executable).hexdigest()
            ranges = {}
            for name, (address, size, _) in original_ranges.items():
                digest = __import__("hashlib").sha256(
                    executable[
                        address - MODULE.RUNTIME_BASE:
                        address - MODULE.RUNTIME_BASE + size
                    ]
                ).hexdigest()
                ranges[name] = (address, size, digest)
            MODULE.VERIFIED_RANGES = ranges
            actor_resources = {
                "resources": [
                    {"participantFourccs": ["AKIR", "INE_"]},
                    {"participantFourccs": ["AKIR", "HATO"]},
                ],
            }
            body_routes = {
                "resources": [{
                    "actorCode": "INE_",
                    "bodies": [{
                        "graph": {
                            "messageGroups": [{
                                "nativeCommands": [
                                    {"commandWord": 0x32},
                                    {"commandWord": 0x33},
                                    {"commandWord": 0x8C},
                                    {"commandWord": 0x2A},
                                ],
                            }],
                        },
                    }],
                }],
            }
            report = MODULE.build_report(
                bytes(executable),
                actor_resources,
                body_routes,
            )
        finally:
            MODULE.EXECUTABLE_SHA256 = original_sha
            MODULE.VERIFIED_RANGES = original_ranges
        self.assertEqual(
            report["summary"]["participantTableLengthCounts"],
            {2: 2},
        )
        self.assertEqual(
            report["summary"]["resourceCountBeginningWithAkir"],
            2,
        )
        self.assertEqual(
            report["summary"]["participantRouteCommandSiteCount"],
            3,
        )
        self.assertEqual(
            report["summary"]["participantPairCommandSiteCount"],
            1,
        )
        control = report["commandFamilies"]["participantControlDispatch"]
        self.assertEqual(
            control["motionTargetExpression"],
            "[participant.x - 0.001, participant.y, participant.z]",
        )
        self.assertEqual(control["motionAxis"], [0.0, 1.0, 0.0])
        self.assertEqual(control["motionRequestAddress"], "0xc0fef0e")


if __name__ == "__main__":
    unittest.main()
