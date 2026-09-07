#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/cutscenes/audit_player_cutscene_capabilities.py"
SPEC = importlib.util.spec_from_file_location("cutscene_capabilities", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class AuditPlayerCutsceneCapabilitiesTest(unittest.TestCase):
    def report(self):
        return MODULE.build_report(
            json.loads((
                ROOT / "tools/evidence/native-cutscene-selector-program-audit.json"
            ).read_text()),
            json.loads((
                ROOT / "tools/evidence/native-cutscene-package-readiness.json"
            ).read_text()),
            json.loads((
                ROOT / "play/data/events/nativeEventPrograms.generated.json"
            ).read_text()),
            json.loads((
                ROOT / "tools/evidence/native-cutscene-corpus-diagnostics.json"
            ).read_text()),
        )

    def test_separates_selector_and_reviewed_owner_surfaces(self):
        report = self.report()
        summary = report["summary"]
        self.assertEqual(summary["selectorSelectionCount"], 46)
        self.assertEqual(summary["selectorNativeOwnerCount"], 6)
        self.assertEqual(summary["selectorSingleAuthPreviewCount"], 40)
        self.assertEqual(summary["uniqueReviewedOwnerCount"], 18)
        self.assertEqual(summary["selectorUnresolvedOperationCallCount"], 0)
        self.assertEqual(summary["authCompiledCount"], 491)

    def test_keeps_research_binding_gaps_separate_from_operations(self):
        report = self.report()
        priorities = report["reviewedResearchBindingPriorities"]
        self.assertEqual(len(priorities), 5)
        self.assertEqual(
            sum(item["affectedBindingCount"] for item in priorities),
            11,
        )
        self.assertTrue(all(
            not item["capabilityId"].startswith("engine-operation:")
            for item in priorities
        ))

    def test_reports_campaign_relevance_without_room_count_inference(self):
        report = self.report()
        focus = {
            item["operationHex"]: item
            for item in report["campaignOperationRelevance"]
        }
        self.assertFalse(focus["0x019e"]["genuinelyCutsceneRelevant"])
        self.assertEqual(
            focus["0x019e"]["relevance"],
            "initial-room-stress-only",
        )
        self.assertTrue(focus["0x0084"]["genuinelyCutsceneRelevant"])
        self.assertEqual(
            focus["0x0084"]["uniqueReviewedOwnerUnion"]["unresolvedCallCount"],
            0,
        )
        self.assertGreater(
            focus["0x0100"]["uniqueReviewedOwnerUnion"]["unresolvedCallCount"],
            0,
        )


if __name__ == "__main__":
    unittest.main()
