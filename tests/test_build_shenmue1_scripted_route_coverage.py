#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.build_shenmue1_scripted_route_coverage import (  # noqa: E402
    SCHEMA,
    build_report,
    markdown_report,
)


def function(
    identity: str,
    actions: list[dict],
    *,
    dialogue: bool = False,
) -> dict:
    return {
        "id": identity,
        "dialogueRegion": ({"voiceIds": ["TEST"]} if dialogue else None),
        "blocks": [{"id": identity, "actions": actions}],
        "unresolvedControlTransfers": [],
    }


class Shenmue1ScriptedRouteCoverageTest(unittest.TestCase):
    def fixture(self) -> dict:
        return {
            "schema": "new-yokosuka-native-event-ir-v1",
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": "a" * 64,
                "entryFunction": "0x100",
                "functions": [
                    function("0x100", [{
                        "kind": "directCall",
                        "callFileOffset": "0x104",
                        "targetFileOffset": "0x200",
                    }, {
                        "kind": "childCoroutineLaunch",
                        "callFileOffset": "0x108",
                        "targetFileOffset": "0x300",
                        "argumentCount": 2,
                    }, {
                        "kind": "engineOperation",
                        "callFileOffset": "0x10c",
                        "operationHex": "0x00aa",
                        "adapterStatus": "unresolved",
                    }]),
                    function("0x200", [{
                        "kind": "engineOperation",
                        "callFileOffset": "0x204",
                        "operationHex": "0x00aa",
                        "adapterStatus": "unresolved",
                    }], dialogue=True),
                    function("0x300", [{
                        "kind": "engineOperation",
                        "callFileOffset": "0x304",
                        "operationHex": "0x013e",
                        "adapterStatus": "proven",
                        "semanticId": "native-operation-013e-resource-binding",
                    }, {
                        "kind": "engineOperation",
                        "callFileOffset": "0x308",
                        "operationHex": "0x0050",
                        "adapterStatus": "proven",
                        "semanticId": "native-operation-0050-aseq-activity-control",
                    }]),
                ],
            }],
        }

    def test_preserves_exact_entry_provenance_without_calling_it_a_scene(self):
        report = build_report(self.fixture(), "b" * 64)
        self.assertEqual(report["schema"], SCHEMA)
        self.assertEqual(report["summary"]["entryCandidateCount"], 2)
        self.assertEqual(report["summary"]["initialEntryCandidateCount"], 1)
        self.assertEqual(
            report["summary"]["childCoroutineEntryCandidateCount"],
            1,
        )
        candidates = report["maps"][0]["entryCandidates"]
        self.assertEqual(candidates[0]["entryFunction"], "0x100")
        self.assertEqual(candidates[0]["entryKinds"], ["scn3-initial"])
        self.assertEqual(candidates[1]["entryFunction"], "0x300")
        self.assertEqual(
            candidates[1]["entryKinds"],
            ["child-coroutine-target"],
        )
        self.assertEqual(candidates[1]["launchSites"], [{
            "sourceFunction": "0x100",
            "callFileOffset": "0x108",
            "argumentCount": 2,
        }])
        self.assertIn(
            "not asserted player-facing scene identities",
            report["evidenceBoundary"][1],
        )

    def test_bounded_typed_table_launch_creates_each_exact_candidate(self):
        fixture = self.fixture()
        launch = fixture["maps"][0]["functions"][0]["blocks"][0]["actions"][1]
        launch.pop("targetFileOffset")
        launch["targetFileOffsets"] = ["0x200", "0x300"]
        launch["targetSource"] = {
            "kind": "typed-table-operation-result",
            "callFileOffset": "0x106",
        }

        report = build_report(fixture, "b" * 64)
        candidates = report["maps"][0]["entryCandidates"]

        self.assertEqual(report["summary"]["entryCandidateCount"], 3)
        self.assertEqual(
            [item["entryFunction"] for item in candidates],
            ["0x100", "0x200", "0x300"],
        )
        self.assertEqual(candidates[1]["launchSites"][0]["targetSource"], {
            "kind": "typed-table-operation-result",
            "callFileOffset": "0x106",
        })

    def test_computes_closures_and_ranks_shared_unresolved_boundaries(self):
        report = build_report(self.fixture(), "b" * 64)
        initial, child = report["maps"][0]["entryCandidates"]
        self.assertEqual(initial["closure"], {
            "functionCount": 3,
            "dialogueRegionCount": 1,
            "authActivityLaunchCount": 1,
            "authResourceBindingCount": 1,
            "unresolvedBoundaryCount": 2,
            "unresolvedBoundaryTypeCount": 1,
        })
        self.assertEqual(initial["coverageState"], "structurally-parsed-blocked")
        self.assertEqual(initial["firstBlocker"], {
            "kind": "engineOperation",
            "identity": "0x00aa",
            "callSiteCount": 2,
            "minimumGraphDepth": 0,
            "firstFunction": "0x100",
            "firstCallFileOffset": "0x10c",
        })
        self.assertEqual(child["coverageState"], "structurally-parsed")
        self.assertEqual(child["closure"]["functionCount"], 1)
        self.assertEqual(child["closure"]["authActivityLaunchCount"], 1)
        self.assertEqual(report["blockerImpact"], [{
            "kind": "engineOperation",
            "identity": "0x00aa",
            "entryCandidateCount": 1,
            "mapinfoCount": 1,
            "closureCallSiteCount": 2,
            "minimumGraphDepth": 0,
        }])

    def test_missing_exact_entry_remains_an_explicit_blocker(self):
        fixture = self.fixture()
        fixture["maps"][0]["entryFunction"] = "0x80"
        report = build_report(fixture, "b" * 64)
        missing = report["maps"][0]["entryCandidates"][0]
        self.assertEqual(missing["coverageState"], "entry-discovery-blocked")
        self.assertEqual(missing["firstBlocker"]["kind"], "missingEntryFunction")
        self.assertEqual(missing["firstBlocker"]["identity"], "0x80")

    def test_runtime_interface_requires_an_executable_semantic(self):
        fixture = self.fixture()
        fixture["maps"][0]["functions"][2]["blocks"][0]["actions"].append({
            "kind": "runtimeInterfaceCall",
            "callFileOffset": "0x30c",
            "runtimeCallKind": "signed-integer-division",
            "behaviorStatus": "proven",
        })
        report = build_report(fixture, "b" * 64)
        child = report["maps"][0]["entryCandidates"][1]
        self.assertEqual(child["coverageState"], "structurally-parsed-blocked")
        self.assertEqual(child["firstBlocker"]["kind"], "runtimeInterfaceCall")

    def test_markdown_reports_structural_denominator_and_blockers(self):
        contents = markdown_report(build_report(self.fixture(), "b" * 64))
        self.assertIn("Exact entry candidates | 2", contents)
        self.assertIn("engineOperation `0x00aa`", contents)
        self.assertIn("not called a", contents)
        self.assertIn("player-facing scene", contents)

    def test_committed_coverage_has_unique_stable_entry_candidates(self):
        report = json.loads(Path(
            "tools/evidence/shenmue1-scripted-route-coverage.json"
        ).read_text())
        self.assertEqual(report["schema"], SCHEMA)
        candidates = [
            candidate
            for source_map in report["maps"]
            for candidate in source_map["entryCandidates"]
        ]
        self.assertEqual(
            len(candidates),
            report["summary"]["entryCandidateCount"],
        )
        self.assertEqual(len({item["id"] for item in candidates}), len(candidates))
        self.assertEqual(
            sum(report["summary"]["coverageStates"].values()),
            len(candidates),
        )
        self.assertTrue(report["blockerImpact"])
        self.assertTrue(all(
            item["entryCandidateCount"] > 0
            for item in report["blockerImpact"]
        ))


if __name__ == "__main__":
    unittest.main()
