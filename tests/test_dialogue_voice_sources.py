import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.build_dialogue_voice_sources import (  # noqa: E402
    build_manifest,
    classify_fully_unlocalized_resources,
    classify_unreachable_localized_voices,
)


def actor_fixture():
    return {
        "resources": [
            {
                "actorCode": "TEST",
                "record": {
                    "messages": [
                        {"voiceId": "F0001A001"},
                        {"voiceId": "F0001A002"},
                    ]
                },
            }
        ]
    }


def inventory_fixture():
    archives = []
    for disc in (1, 2):
        records = [
            {
                "index": 0,
                "speakerId": "TEST",
                "voiceMember": "F0001A001.str",
                "timingSha256": f"timing-{disc}",
            }
        ]
        if disc == 1:
            records.append(
                {
                    "index": 1,
                    "speakerId": "TEST",
                    "voiceMember": "F0001A002.str",
                    "timingSha256": "timing-other",
                }
            )
        archives.append(
            {
                "disc": disc,
                "source": f"/disc{disc}/FREE0{disc}.AFS",
                "archive": f"FREE0{disc}.AFS",
                "subtitles": [
                    {"member": "F0001.SRF", "records": records}
                ],
            }
        )
    return {"archives": archives}


def reachability_actor_fixture():
    return {
        "resources": [
            {
                "actorCode": "TEST",
                "actorLabel": "Test Guard",
                "afsEntryIndex": 4,
                "packageChildIndex": 0,
                "record": {
                    "pathString": "/localized/voice/F0001",
                    "messages": [
                        {
                            "index": 0,
                            "voiceId": "F0001B001",
                            "sourceText": "Stop!",
                            "subtitleInventory": None,
                        },
                        {
                            "index": 1,
                            "voiceId": "F0001B002",
                            "sourceText": "Hello.",
                            "subtitleInventory": {"voiceMember": "F0001B002"},
                        },
                    ],
                },
            },
            {
                "actorCode": "OLD",
                "actorLabel": "Legacy Guard",
                "afsEntryIndex": 5,
                "packageChildIndex": 0,
                "record": {
                    "pathString": "/legacy/voice/X0001",
                    "messages": [
                        {
                            "index": 0,
                            "voiceId": "X0001B001",
                            "sourceText": "Legacy.",
                            "subtitleInventory": None,
                        }
                    ],
                },
            },
        ]
    }


def reachability_routes_fixture():
    def resource(actor_code, afs_entry_index, selected):
        return {
            "actorCode": actor_code,
            "afsEntryIndex": afs_entry_index,
            "packageChildIndex": 0,
            "bodies": [
                {
                    "graph": {
                        "messageGroups": [
                            {
                                "messageSelections": [
                                    {"messageIndex": index}
                                    for index in selected
                                ]
                            }
                        ]
                    }
                }
            ],
        }

    return {
        "resources": [
            resource("TEST", 4, [1]),
            resource("OLD", 5, []),
        ]
    }


class DialogueVoiceSourceTests(unittest.TestCase):
    def test_classifies_only_complete_unlocalized_resources(self):
        resources, voice_ids = classify_fully_unlocalized_resources(
            reachability_actor_fixture(),
            {"F0001B001", "X0001B001"},
        )

        self.assertEqual([record["actorCode"] for record in resources], ["OLD"])
        self.assertEqual(voice_ids, {"X0001B001"})

    def test_classifies_only_unreferenced_localized_records(self):
        unreachable = classify_unreachable_localized_voices(
            reachability_actor_fixture(),
            reachability_routes_fixture(),
            {"F0001B001", "X0001B001"},
        )

        self.assertEqual(
            [record["voiceId"] for record in unreachable],
            ["F0001B001"],
        )
        self.assertEqual(
            unreachable[0]["occurrences"][0]["messageIndex"], 0
        )

    def test_deduplicates_only_byte_identical_native_payloads(self):
        hashes = {
            ("/disc1/FREE01.AFS", "F0001A001.STR"): (100, "same"),
            ("/disc2/FREE02.AFS", "F0001A001.STR"): (100, "same"),
            ("/disc1/FREE01.AFS", "F0001A002.STR"): (80, "other"),
        }

        manifest = build_manifest(
            actor_fixture(), inventory_fixture(), hashes
        )

        self.assertEqual(manifest["summary"]["actorVoiceIdCount"], 2)
        self.assertEqual(manifest["summary"]["matchedVoiceIdCount"], 2)
        self.assertEqual(
            manifest["summary"]["identicalDuplicateVoiceIdCount"], 1
        )
        self.assertEqual(
            manifest["summary"]["contentVariantVoiceIdCount"], 0
        )
        self.assertEqual(
            manifest["summary"]["canonicalNativeByteLength"], 180
        )
        self.assertEqual(
            manifest["summary"]["allSourceNativeByteLength"], 280
        )
        self.assertEqual(
            manifest["voices"][0]["variants"][0]["sources"][0]["disc"],
            1,
        )

    def test_preserves_same_id_content_variants(self):
        hashes = {
            ("/disc1/FREE01.AFS", "F0001A001.STR"): (100, "disc-one"),
            ("/disc2/FREE02.AFS", "F0001A001.STR"): (104, "disc-two"),
            ("/disc1/FREE01.AFS", "F0001A002.STR"): (80, "other"),
        }

        manifest = build_manifest(
            actor_fixture(), inventory_fixture(), hashes
        )

        self.assertEqual(
            manifest["summary"]["contentVariantVoiceIdCount"], 1
        )
        self.assertEqual(
            manifest["contentVariantVoiceIds"], ["F0001A001"]
        )
        self.assertEqual(
            manifest["voices"][0]["contentVariantCount"], 2
        )


if __name__ == "__main__":
    unittest.main()
