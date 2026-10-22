import json
import unittest
from tools.scripting.operations import extract_scene_object_creation_evidence as evidence


class NativeObjectCreationEvidenceTest(unittest.TestCase):
    def test_exact_executable_regenerates_both_artifacts(self):
        executable = (evidence.ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes()
        report = evidence.build_report(executable)
        self.assertEqual(report, json.loads((evidence.ROOT / "tools/evidence/scene-object-creation-evidence.json").read_text()))
        self.assertEqual(report["contract"], json.loads((evidence.ROOT / "play/data/events/nativeSceneObjectCreation.generated.json").read_text()))
        self.assertEqual(report["contract"]["taskKinds"], [5, 6, 7, 8])
        self.assertEqual(report["contract"]["autoName"], {"counterAddress": "0x0c29b12c", "format": " %03d", "initialCounter": 0, "modulus": 1000})
        changed = bytearray(executable)
        changed[0x0C17344A - evidence.BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            evidence.build_report(changed)


if __name__ == "__main__":
    unittest.main()
