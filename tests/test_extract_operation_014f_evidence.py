import importlib.util, json, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("operation_014f", ROOT / "tools/scripting/operations/extract_operation_014f_evidence.py")
MODULE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)
class TestOperation014f(unittest.TestCase):
    def test_inventory(self):
        report = MODULE.build_report(MODULE.DEFAULT_EXECUTABLE.read_bytes(), json.loads(MODULE.DEFAULT_EVENT_IR.read_text()))
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 63)
        self.assertEqual(report["operation"]["globalFloatWord"], "0x0c21bc74")
if __name__ == "__main__": unittest.main()
