import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "sound_command_operation_evidence",
    ROOT / "tools/scripting/operations/extract_sound_command_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SoundCommandOperationEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_AICA_DRIVER.read_bytes(),
        )

    def test_exact_handler_forwards_three_arguments(self):
        operation = self.report["operation"]
        self.assertEqual(operation["operationHex"], "0x006c")
        self.assertEqual(operation["dispatchAddress"], "0x0c17a91c")
        self.assertEqual(operation["forwardedArguments"], [0, 1, 2])

    def test_authored_audio_pairs_remain_numeric(self):
        corroboration = self.report["authoredCorroboration"]
        self.assertEqual(corroboration["bank"], "A904")
        self.assertEqual(
            corroboration["provenStartStopPairs"],
            [[1, 2], [13, 14], [17, 18], [19, 20]],
        )

    def test_dispatcher_proves_direct_and_parameterized_queue_routes(self):
        dispatcher = self.report["dispatcher"]
        self.assertEqual(dispatcher["sha256"], MODULE.DISPATCHER_SHA256)
        self.assertEqual(dispatcher["commandClassification"], "unsigned low byte of argument zero")
        self.assertEqual(dispatcher["directQueue"], {
            "minimumInclusive": 0xA8,
            "minimumInclusiveHex": "0xa8",
            "targetAddress": "0x0c1d4b18",
            "behavior": "forwards the complete command word unchanged",
        })
        self.assertEqual(dispatcher["parameterizedRoute"], {
            "maximumExclusive": 0xA5,
            "maximumExclusiveHex": "0xa5",
            "targetAddress": "0x0c1d4770",
            "behavior": "constructs a queued command from all three arguments",
            "individualCommandMeanings": "unresolved",
        })

    def test_exact_a004_tuple_is_ignored_by_the_original_aica_driver(self):
        driver = self.report["aicaDriver"]
        self.assertEqual(driver["sha256"], MODULE.AICA_DRIVER_SHA256)
        self.assertEqual(
            driver["commandDispatcher"]["belowEightBehavior"],
            "returns without a sound-handler dispatch",
        )
        controls = driver["provenIgnoredControls"]
        self.assertEqual(len(controls), 3)
        self.assertEqual(
            [(value["area"], value["dreamcastByteOrder"], value["argumentsOneAndTwo"])
             for value in controls],
            [
                ("D000", "A0040000", [2, 115]),
                ("OP02", "A0040000", [2, 100]),
                ("OP02", "A00A0000", [2, 30]),
            ],
        )
        self.assertTrue(all(value["driverTopNibble"] < 8 for value in controls))
        self.assertTrue(all(value["playerVisibleEffect"] == "none" for value in controls))


if __name__ == "__main__":
    unittest.main()
