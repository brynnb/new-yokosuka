import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];S=importlib.util.spec_from_file_location("op52",ROOT/"tools/scripting/operations/extract_operation_0052_evidence.py");M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class T(unittest.TestCase):
 def test_inventory(self):
  r=M.build_report(M.DEFAULT_EXECUTABLE.read_bytes(),json.loads(M.DEFAULT_EVENT_IR.read_text()));self.assertEqual(r["allDiscInventory"]["authoredCallCount"],97);self.assertEqual(r["operation"]["entryStrideBytes"],12)
if __name__=="__main__":unittest.main()
