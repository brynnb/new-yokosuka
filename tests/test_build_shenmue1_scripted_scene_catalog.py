#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.build_shenmue1_scripted_scene_catalog import (  # noqa: E402
    SCHEMA,
    build_catalog,
    markdown_report,
)


class Shenmue1ScriptedSceneCatalogTest(unittest.TestCase):
    def fixture(self):
        map_hash = "a" * 64
        resource_id = "d1:TEST:mapinfo:aaaaaaaaaaaa:trck:0x20"
        coverage = {
            "schema": "new-yokosuka-shenmue1-scripted-route-coverage-v1",
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": map_hash,
                "initialEntryFunction": "0x100",
                "reachableFunctionCount": 2,
                "entryCandidateCount": 2,
                "entryCandidates": [{
                    "id": "disc1/TEST/aaaaaaaaaaaa/0x100",
                    "entryFunction": "0x100",
                    "entryKinds": ["scn3-initial"],
                    "launchSiteCount": 0,
                    "coverageState": "structurally-parsed",
                    "closure": {"functionCount": 2},
                    "firstBlocker": None,
                }, {
                    "id": "disc1/TEST/aaaaaaaaaaaa/0x200",
                    "entryFunction": "0x200",
                    "entryKinds": ["child-coroutine-target"],
                    "launchSiteCount": 1,
                    "coverageState": "structurally-parsed-blocked",
                    "closure": {"functionCount": 1},
                    "firstBlocker": {
                        "kind": "engineOperation",
                        "identity": "0x1234",
                    },
                }],
            }],
        }
        inventory = {
            "schema": "new-yokosuka-shenmue1-scripted-scene-inventory-v1",
            "mapinfoPrograms": [{
                "disc": 1,
                "area": "TEST",
                "sha256": map_hash,
                "sourcePath": "disc1/SCENE/01/TEST/MAPINFO.BIN",
                "embeddedAuthResourceIds": [resource_id],
            }],
            "authResources": [{
                "id": resource_id,
                "disc": 1,
                "area": "TEST",
                "kind": "mapinfo-embedded",
                "sourcePath": "disc1/SCENE/01/TEST/MAPINFO.BIN",
                "sourceOffset": "0x20",
                "byteLength": 100,
                "payloadSha256": "b" * 64,
            }, {
                "id": "d1:TEST:archive:TEST/AUTH.PKS:0:ONE.AUTH",
                "disc": 1,
                "area": "TEST",
                "kind": "archive-member",
                "sourcePath": "disc1/SCENE/01/TEST/AUTH.PKS",
                "sourceOffset": "0x40",
                "byteLength": 100,
                "payloadSha256": "b" * 64,
            }],
            "authPayloads": [{
                "sha256": "b" * 64,
                "byteLength": 100,
                "parseStatus": "complete",
                "logicalResourceIds": [resource_id],
            }],
        }
        pack = {
            "schema": "new-yokosuka-native-event-program-pack-v1",
            "programs": [{
                "id": "reviewed-test",
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": map_hash,
                "entryFunction": "0x100",
                "summary": {"functionCount": 2, "actionCount": 3},
                "evidence": ["test-evidence.json"],
            }],
        }
        return coverage, inventory, pack

    def test_joins_exact_entries_resources_and_reviewed_programs(self):
        catalog = build_catalog(*self.fixture(), source_hashes={"test": "c" * 64})
        self.assertEqual(catalog["schema"], SCHEMA)
        self.assertEqual(catalog["summary"]["entryCandidateCount"], 2)
        self.assertEqual(catalog["summary"]["reviewedProgramCount"], 1)
        source_map = catalog["maps"][0]
        self.assertEqual(
            source_map["entryCandidates"][0]["availability"],
            "reviewed-production",
        )
        self.assertEqual(
            source_map["entryCandidates"][1]["availability"],
            "research-only",
        )
        self.assertEqual(
            len(source_map["authDependencies"]["exactMapEmbeddedResourceIds"]),
            1,
        )
        self.assertEqual(
            len(source_map["authDependencies"]["areaArchiveCandidateResourceIds"]),
            1,
        )
        self.assertEqual(
            source_map["authDependencies"]["ownershipStatus"],
            "entry-ownership-unresolved",
        )

    def test_keeps_reviewed_descendant_route_separate_from_entry_candidates(self):
        coverage, inventory, pack = self.fixture()
        pack["programs"][0]["entryFunction"] = "0x300"
        catalog = build_catalog(coverage, inventory, pack)
        self.assertEqual(catalog["maps"][0]["reviewedProgramIds"], [
            "reviewed-test",
        ])
        self.assertTrue(all(
            item["availability"] == "research-only"
            for item in catalog["maps"][0]["entryCandidates"]
        ))
        self.assertEqual(
            catalog["reviewedPrograms"][0]["entryFunction"],
            "0x300",
        )

    def test_rejects_map_corpus_drift(self):
        coverage, inventory, pack = self.fixture()
        inventory["mapinfoPrograms"][0]["sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "MAPINFO corpus mismatch"):
            build_catalog(coverage, inventory, pack)

    def test_markdown_keeps_research_and_production_boundaries_visible(self):
        catalog = build_catalog(*self.fixture())
        report = markdown_report(catalog)
        self.assertIn("Research-only", report)
        self.assertIn("Reviewed production programs | 1", report)
        self.assertIn("`reviewed-test`", report)

    def test_committed_catalog_covers_the_complete_inventory(self):
        catalog = json.loads(Path(
            "play/data/events/nativeScriptedSceneCatalog.generated.json"
        ).read_text())
        self.assertEqual(catalog["schema"], SCHEMA)
        self.assertEqual(catalog["summary"]["mapinfoCount"], 136)
        self.assertEqual(catalog["summary"]["entryCandidateCount"], 5476)
        self.assertEqual(catalog["summary"]["logicalAuthResourceCount"], 491)
        self.assertEqual(catalog["summary"]["uniqueAuthPayloadCount"], 404)
        self.assertEqual(
            sum(catalog["summary"]["availabilityStates"].values()),
            5476,
        )
        self.assertEqual(len({item["id"] for item in catalog["maps"]}), 136)


if __name__ == "__main__":
    unittest.main()
