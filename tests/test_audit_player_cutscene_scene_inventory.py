#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/cutscenes/audit_player_cutscene_scene_inventory.py"
SPEC = importlib.util.spec_from_file_location("player_scene_inventory", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class AuditPlayerCutsceneSceneInventoryTest(unittest.TestCase):
    def report(self):
        paths = [
            ROOT / "tools/data/player-cutscene-scene-groups.json",
            ROOT / "tools/evidence/native-cutscene-selector-program-audit.json",
            ROOT / "tools/evidence/native-cutscene-package-readiness.json",
            ROOT / "tools/evidence/native-activity-owner-candidates.json",
            ROOT / "tools/data/native-activity-owner-dispositions.json",
            ROOT / "play/data/events/nativeEventPrograms.generated.json",
            ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json",
            ROOT / "tools/evidence/player-cutscene-owner-discovery.json",
        ]
        return MODULE.build_report(*(
            json.loads(path.read_text(encoding="utf-8")) for path in paths
        ))

    def test_groups_every_selector_entry_once(self):
        report = self.report()
        summary = report["summary"]
        self.assertEqual(summary["selectorEntryCount"], 58)
        self.assertEqual(summary["selectedOwnerTriggerGroupCount"], 21)
        selector_ids = [
            selector_id
            for group in report["selectedOwnerTriggerGroups"]
            for selector_id in group["selectorIds"]
        ]
        self.assertEqual(len(selector_ids), 58)
        self.assertEqual(len(set(selector_ids)), 58)

    def test_partitions_research_bindings_by_scene_meaning(self):
        report = self.report()
        summary = report["summary"]
        self.assertEqual(summary["missingCoherentSceneCount"], 0)
        self.assertEqual(summary["missingSceneAuthBindingCount"], 0)
        self.assertEqual(summary["reviewedNonSceneAuthBindingCount"], 3)
        self.assertEqual(summary["selectedResearchOnlyAuthBindingCount"], 5)
        self.assertEqual(report["missingScenesRanked"], [])

    def test_does_not_count_duplicates_or_unresolved_routes_as_scenes(self):
        report = self.report()
        summary = report["summary"]
        self.assertEqual(summary["duplicateInstallerCandidateCount"], 2)
        self.assertEqual(summary["unresolvedOwnerCandidateCount"], 0)
        self.assertEqual(summary["unresolvedOwnerCandidateSelectionCount"], 0)
        self.assertEqual(summary["newlyDiscoveredPlayerFacingCandidateCount"], 5)
        self.assertEqual(summary["promotedDiscoveredPlayerFacingSceneCount"], 10)
        self.assertEqual(summary["newlyDiscoveredPlayerFacingSceneCount"], 0)
        self.assertEqual(summary["newlyDiscoveredAuthPayloadCount"], 12)
        self.assertEqual(summary["reviewedAmbientOrGameplayCandidateCount"], 4)

    def test_discovery_collapses_replay_installs_but_preserves_real_variants(self):
        report = self.report()
        self.assertEqual(report["newlyDiscoveredMissingScenes"], [])
        selected = {item["id"]: item for item in report["selectedOwnerTriggerGroups"]}
        self.assertEqual(len(selected["nozomi-tears"]["discoverySceneIds"]), 2)
        self.assertEqual(len(selected["shenhua-dream-visions"]["discoverySceneIds"]), 6)
        self.assertEqual(selected["toki-asada-conversation"]["discoverySceneIds"], [
            "toki-asada-conversation",
        ])

    def test_composite_scenes_keep_native_segment_boundaries(self):
        report = self.report()
        selected = {item["id"]: item for item in report["selectedOwnerTriggerGroups"]}
        self.assertEqual(selected["nozomi-rescue"]["content"]["authBindingCount"], 4)
        self.assertEqual(selected["kitten-care"]["content"]["authBindingCount"], 3)
        self.assertEqual(selected["nozomi-rescue"]["content"]["durationFrames"], 3201)
        self.assertEqual(selected["kitten-care"]["content"]["durationFrames"], 6911)


if __name__ == "__main__":
    unittest.main()
