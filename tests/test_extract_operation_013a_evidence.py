import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];SPEC=importlib.util.spec_from_file_location("op013a",ROOT/"tools/scripting/operations/extract_operation_013a_evidence.py");M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)
class T(unittest.TestCase):
 def test_inventory(self):
  r=M.build_report(M.DEFAULT_EXECUTABLE.read_bytes(),json.loads(M.DEFAULT_EVENT_IR.read_text()));self.assertEqual(r["allDiscInventory"]["authoredCallCount"],265);self.assertEqual(r["allDiscInventory"]["staticallyResolvableOperandCallCount"],249)
if __name__=="__main__":unittest.main()
