import sys
import unittest
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools.cutscenes.build_native_cutscene_corpus_diagnostics import build_report  # noqa: E402


def source_map(area, sha256, entry, functions):
    return {
        "disc": 1,
        "area": area,
        "mapinfoSha256": sha256,
        "entryFunction": entry,
        "functions": functions,
    }


def function(function_id):
    return {
        "id": function_id,
        "blocks": [{"id": function_id, "actions": []}],
        "dialogueRegion": None,
    }


class NativeCutsceneCorpusDiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.event_ir = {
            "schema": "new-yokosuka-native-event-ir-v1",
            "maps": [
                source_map("GOOD", "a" * 64, "0x10", [function("0x10")]),
                source_map("MISS", "b" * 64, "0x20", []),
            ],
        }
        self.inventory = {
            "schema": "new-yokosuka-shenmue1-scripted-scene-inventory-v1",
            "mapinfoPrograms": [
                {
                    "disc": 1,
                    "area": "GOOD",
                    "sha256": "a" * 64,
                    "sourcePath": "disc1/GOOD/MAPINFO.BIN",
                    "byteLength": 100,
                },
                {
                    "disc": 1,
                    "area": "MISS",
                    "sha256": "b" * 64,
                    "sourcePath": "disc1/MISS/MAPINFO.BIN",
                    "byteLength": 200,
                },
            ],
            "authPayloads": [
                {
                    "sha256": "c" * 64,
                    "parseStatus": "complete",
                    "issues": [],
                },
                {
                    "sha256": "d" * 64,
                    "parseStatus": "track-only",
                    "issues": ["missing ACAM"],
                },
            ],
            "authResources": [
                {
                    "id": "d1:GOOD:mapinfo:auth0",
                    "disc": 1,
                    "area": "GOOD",
                    "kind": "mapinfo-embedded",
                    "sourcePath": "disc1/GOOD/MAPINFO.BIN",
                    "sourceOffset": "0x100",
                    "byteLength": 16,
                    "payloadSha256": "c" * 64,
                },
                {
                    "id": "d1:MISS:archive:auth1",
                    "disc": 1,
                    "area": "MISS",
                    "kind": "archive-member",
                    "sourcePath": "disc1/MISS/SCENE.PKS",
                    "archiveMember": "SEQDATA0.AUTH",
                    "archiveMemberIndex": 0,
                    "byteLength": 32,
                    "payloadSha256": "d" * 64,
                },
            ],
        }
        self.container_encodings = {
            "schema": "new-yokosuka-scn3-container-encoding-evidence-v1",
            "records": [
                {
                    "disc": 1,
                    "area": "GOOD",
                    "mapinfoSha256": "a" * 64,
                    "classification": "native-sh4-scn3-program",
                    "scn3FileOffset": "0x8",
                    "encodingMarker": "0x00020000",
                    "entryFileOffset": "0x10",
                },
                {
                    "disc": 1,
                    "area": "MISS",
                    "mapinfoSha256": "b" * 64,
                    "classification": (
                        "legacy-instruction-stream-scn3-program"
                    ),
                    "scn3FileOffset": "0x8",
                    "encodingMarker": "0x00000100",
                    "entryFileOffset": "0x20",
                },
            ],
        }

    def report(self, event_ir=None, inventory=None, container_encodings=None):
        return build_report(
            event_ir or self.event_ir,
            inventory or self.inventory,
            container_encodings or self.container_encodings,
            event_ir_sha256="event-hash",
            inventory_sha256="inventory-hash",
            container_encodings_sha256="encoding-hash",
        )

    def test_reports_compiled_and_first_blocked_records_with_provenance(self):
        report = self.report()
        self.assertEqual(report["summary"], {
            "mapinfoCount": 2,
            "compiledMapinfoCount": 1,
            "blockedMapinfoCount": 1,
            "logicalAuthResourceCount": 2,
            "compiledAuthResourceCount": 1,
            "blockedAuthResourceCount": 1,
            "firstBlockerCapabilityCount": 2,
        })
        missing = next(value for value in report["mapinfo"] if value["area"] == "MISS")
        self.assertEqual(
            missing["firstBlocker"]["capabilityId"],
            "control-flow:unsupported-scn3-encoding",
        )
        self.assertEqual(
            missing["firstBlocker"]["provenance"]["scn3EncodingMarker"],
            "0x00000100",
        )
        self.assertEqual(
            missing["firstBlocker"]["provenance"]["mapinfoPath"],
            "disc1/MISS/MAPINFO.BIN",
        )
        blocked_auth = next(
            value for value in report["authResources"] if value["status"] == "blocked"
        )
        self.assertEqual(
            blocked_auth["firstBlocker"]["capabilityId"],
            "auth-format:track-only",
        )
        self.assertEqual(
            blocked_auth["firstBlocker"]["provenance"]["archiveMember"],
            "SEQDATA0.AUTH",
        )

    def test_output_is_independent_of_source_record_order(self):
        event_ir = deepcopy(self.event_ir)
        inventory = deepcopy(self.inventory)
        event_ir["maps"].reverse()
        inventory["mapinfoPrograms"].reverse()
        inventory["authResources"].reverse()
        inventory["authPayloads"].reverse()
        self.assertEqual(self.report(), self.report(event_ir, inventory))

    def test_rejects_ir_and_resource_map_corpus_drift(self):
        inventory = deepcopy(self.inventory)
        inventory["mapinfoPrograms"].pop()
        with self.assertRaisesRegex(
            ValueError, "native event IR and MAPINFO resource index disagree"
        ):
            self.report(inventory=inventory)

    def test_rejects_container_encoding_corpus_drift(self):
        encodings = deepcopy(self.container_encodings)
        encodings["records"].pop()
        with self.assertRaisesRegex(
            ValueError, "container encoding evidence and MAPINFO corpus disagree"
        ):
            self.report(container_encodings=encodings)


if __name__ == "__main__":
    unittest.main()
