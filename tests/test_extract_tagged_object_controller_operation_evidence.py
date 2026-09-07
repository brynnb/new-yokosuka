#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_tagged_object_controller_operation_evidence",
    ROOT / "tools/scripting/operations/extract_tagged_object_controller_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class TaggedObjectControllerEvidenceTest(unittest.TestCase):
    def test_exact_outer_modes_are_verified(self):
        executable = MODULE.DEFAULT_EXECUTABLE.read_bytes()
        contract = MODULE.verify(executable)
        self.assertEqual(contract["pairInitializer"], "0x0c0c9b4c")
        self.assertEqual(contract["configurationWriter"], "0x0c0ccafe")
        self.assertEqual(contract["configurationPointer"], "0x0c2164b4")


if __name__ == "__main__":
    unittest.main()
