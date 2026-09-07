#!/usr/bin/env python3

import sys
import json
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_tagged_telm_control_operation_evidence import (  # noqa: E402
    DEFAULT_MAPINFO,
    EXECUTABLE_SHA256,
    MAPINFO_SHA256,
    build_report,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TaggedTelmControlOperationEvidenceTest(unittest.TestCase):
    def test_rejects_unverified_inputs(self):
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            build_report(b"not the executable", b"not the map")

    def test_declared_hashes_are_full_sha256(self):
        self.assertEqual(len(EXECUTABLE_SHA256), 64)
        self.assertEqual(len(MAPINFO_SHA256), 64)

    def test_verified_fixture_recovers_mode_10_state_transition(self):
        root = PROJECT_ROOT
        executable = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
        mapinfo = DEFAULT_MAPINFO
        if not executable.exists() or not mapinfo.exists():
            self.skipTest("private verified fixtures unavailable")
        report = build_report(executable.read_bytes(), mapinfo.read_bytes())
        mode10 = report["operation"]["mode10"]
        self.assertEqual(mode10["primaryLinkValue"], -1)
        self.assertEqual(mode10["controllerStateFieldOffset"], "0x013c")
        self.assertEqual(mode10["controllerStateValue"], 21)
        self.assertEqual(
            mode10["controllerState21HandlerAddress"],
            "0x0c16f8a8",
        )

    def test_verified_fixture_recovers_binding_and_vector_modes(self):
        executable = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
        mapinfo = DEFAULT_MAPINFO
        if not executable.exists() or not mapinfo.exists():
            self.skipTest("private verified fixtures unavailable")
        operation = build_report(
            executable.read_bytes(),
            mapinfo.read_bytes(),
        )["operation"]
        self.assertEqual(operation["mode0"]["helperAddress"], "0x0c16fbf4")
        self.assertEqual(operation["mode1"]["clearedBindingValues"], [0, -1])
        self.assertEqual(
            operation["mode11"]["destinationFieldOffsets"],
            ["0x07bc", "0x07c0", "0x07c4"],
        )
        self.assertEqual(
            operation["mode12"]["destinationFieldOffsets"],
            ["0x07c8", "0x07cc", "0x07d0"],
        )
        consumer = operation["bindingConsumer"]
        self.assertEqual(consumer["telephoneReceiverRenderControl"], 3)
        self.assertEqual(
            consumer["selectorRoutes"]["3"],
            {
                "actorRenderKey": -66,
                "ryoRuntimeMatrixIndex": 30,
                "bodySide": "left",
            },
        )
        self.assertEqual(
            consumer["handCorrection"],
            {
                "translation": [
                    0.02499999850988388,
                    0.07499999552965164,
                    0.0,
                ],
                "rotationAxis": "z",
                "rotationFixedTurnRaw": 0x4000,
                "rotationDegrees": 90,
                "translationRoutineAddress": "0x0c1d28e0",
                "rotationZRoutineAddress": "0x0c1d25c0",
            },
        )

    def test_all_disc_inventory_recovers_all_six_proven_modes(self):
        root = PROJECT_ROOT
        executable = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
        mapinfo = DEFAULT_MAPINFO
        event_ir = root / ".disc-work/dialogue/native-event-ir.json"
        if (
            not executable.exists()
            or not mapinfo.exists()
            or not event_ir.exists()
        ):
            self.skipTest("private verified fixtures unavailable")
        report = build_report(
            executable.read_bytes(),
            mapinfo.read_bytes(),
            json.loads(event_ir.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 297)
        self.assertEqual(inventory["remainingUnresolvedCallCount"], 44)
        self.assertEqual(inventory["dialogueRegionCallCount"], 99)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 29, "1": 32, "4": 55, "10": 77, "11": 52, "12": 52},
        )
        self.assertEqual(
            inventory["dialogueRegionModeCounts"],
            {"4": 44, "10": 55},
        )


if __name__ == "__main__":
    unittest.main()
