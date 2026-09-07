import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_actor_resources",
    ROOT / "tools/scripting/extract_dialogue_actor_resources.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueActorResourceExtractorTests(unittest.TestCase):
    def test_verified_executable_proves_actor_resource_join(self):
        evidence = MODULE.verify_executable(
            MODULE.DEFAULT_EXECUTABLE.read_bytes()
        )
        join = evidence["provenJoin"]
        self.assertEqual(join["actorPackageHandleOffset"], "0x8c")
        self.assertEqual(join["resourceType"], "BIN ")
        self.assertEqual(join["storedRuntimeActorOffset"], "0x9c")

    def test_verified_humans_archive_exposes_authored_actor_resources(self):
        labels = MODULE.scheduled_actor_labels(
            MODULE.DEFAULT_SCHEDULED_ACTORS
        )
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_HUMANS.read_bytes(),
            labels,
        )
        self.assertEqual(report["summary"]["resourceCount"], 262)
        self.assertEqual(report["summary"]["uniqueActorCodeCount"], 257)
        self.assertEqual(
            report["summary"][
                "scheduledActorCodeWithConversationResourceCount"
            ],
            210,
        )
        mappings = {
            item["actorCode"]: item["authoredPersonIdentity"]
            for item in report["resources"]
        }
        self.assertEqual(mappings["AKMI"], "AKMI")
        self.assertEqual(mappings["JONO"], "YOPA")
        self.assertEqual(mappings["MTRI"], "YOPA")

    def test_static_record_schema_preserves_unresolved_numeric_fields(self):
        self.assertEqual(
            MODULE.STATIC_POINTER_FIELDS,
            (
                (0x10, 0x38),
                (0x14, 0x40),
                (0x18, 0x44),
                (0x20, 0x28),
                (0x24, 0x30),
                (0x28, 0x2C),
                (0x2C, 0x3C),
            ),
        )
        resources = MODULE.extract_resources(
            MODULE.DEFAULT_HUMANS.read_bytes()
        )["resources"]
        akmi = next(item for item in resources if item["actorCode"] == "AKMI")
        self.assertEqual(akmi["record"]["numericBytes"], [2, 0, 0, 0])
        self.assertEqual(
            akmi["record"]["participantFourccs"],
            ["AKIR", "AKMI"],
        )
        self.assertEqual(
            akmi["record"]["participantFacingTargets"],
            [],
        )
        aksk = next(
            item for item in resources if item["actorCode"] == "AKSK"
        )
        self.assertEqual(
            aksk["record"]["participantFacingTargets"],
            [
                [6.0, 1.5, 86.0],
                [-57.0, 1.5, 83.0],
                [-19.200000762939453, 1.5, 76.4000015258789],
            ],
        )
        self.assertTrue(
            akmi["record"]["pathString"].endswith("/Msg/voice/F1015")
        )
        self.assertEqual(akmi["record"]["messageCount"], 190)
        first = akmi["record"]["messages"][0]
        self.assertEqual(first["voiceId"], "F1015B001")
        self.assertEqual(first["localCode"], "B001")
        self.assertEqual(
            first["sourceText"],
            "明美「Oh, look who's here!」",
        )
        self.assertEqual(first["sourceTextEncoding"], "euc_jp")

    def test_message_tables_and_subtitle_inventory_join_are_corpus_wide(self):
        inventory = MODULE.json.loads(
            MODULE.DEFAULT_DIALOGUE_INVENTORY.read_text(encoding="utf-8")
        )
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_HUMANS.read_bytes(),
            MODULE.scheduled_actor_labels(MODULE.DEFAULT_SCHEDULED_ACTORS),
            inventory,
        )
        summary = report["summary"]
        self.assertEqual(summary["messageEntryCount"], 28049)
        self.assertEqual(summary["uniqueVoiceIdCount"], 22397)
        self.assertEqual(summary["minimumMessagesPerResource"], 2)
        self.assertEqual(summary["maximumMessagesPerResource"], 422)
        self.assertEqual(summary["voiceLocalCodeSuffixMismatchCount"], 0)
        self.assertEqual(summary["participantFacingTargetResourceCount"], 34)
        self.assertEqual(summary["participantFacingTargetCount"], 65)
        self.assertEqual(
            summary["subtitleInventoryMatchedMessageEntryCount"],
            26878,
        )
        self.assertEqual(
            summary["subtitleInventoryUnmatchedMessageEntryCount"],
            1171,
        )


if __name__ == "__main__":
    unittest.main()
