import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dialogue_script_references import (  # noqa: E402
    build_report,
    build_voice_index,
    is_script_voice_id,
    scan_mapinfo,
)


def inventory_fixture() -> dict[str, object]:
    return {
        "schema": "test",
        "archives": [
            {
                "disc": 1,
                "scene": "FREE",
                "archive": "FREE01.AFS",
                "subtitles": [
                    {
                        "member": "F1030.SRF",
                        "records": [
                            {
                                "index": 0,
                                "speakerId": "AKIR",
                                "voiceMember": "F1030B001.str",
                                "sourceText": "Hello",
                                "displayText": "Hello",
                            }
                        ],
                    }
                ],
            }
        ],
    }


class DialogueScriptReferenceTests(unittest.TestCase):
    def test_rejects_short_archive_local_names(self):
        self.assertFalse(is_script_voice_id("END"))
        self.assertFalse(is_script_voice_id("OPEN1"))
        self.assertTrue(is_script_voice_id("F1030B001"))

    def test_indexes_only_exact_voice_members(self):
        index = build_voice_index(inventory_fixture())

        self.assertEqual(list(index), ["F1030B001"])
        self.assertEqual(index["F1030B001"][0]["speakerId"], "AKIR")

    def test_scans_only_exact_null_terminated_tokens(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "MAPINFO.BIN"
            path.write_bytes(
                b"prefix\0F1030B001\0F1030B001X\0F1030B001"
            )

            references = scan_mapinfo(path, {"F1030B001"})

        self.assertEqual(references, [(7, "F1030B001")])

    def test_report_retains_offsets_and_can_omit_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            area = root / "D000"
            area.mkdir()
            (area / "MAPINFO.BIN").write_bytes(b"\0F1030B001\0")

            report = build_report(
                inventory_fixture(),
                [(1, root)],
                include_text=False,
            )

        self.assertEqual(report["summary"]["referenceCount"], 1)
        reference = report["references"][0]
        self.assertEqual(reference["area"], "D000")
        self.assertEqual(reference["fileOffsetHex"], "0x1")
        self.assertEqual(
            reference["dialogueRecords"][0]["subtitleMember"],
            "F1030.SRF",
        )
        self.assertNotIn(
            "sourceText",
            json.dumps(reference["dialogueRecords"]),
        )


if __name__ == "__main__":
    unittest.main()
