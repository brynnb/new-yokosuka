import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools/scripting/operations/extract_operation_017d_evidence.py"
SPEC = importlib.util.spec_from_file_location("extract_operation_017d", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_operation_017d_evidence_is_reproducible():
    report = MODULE.build_report(
        (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
        json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()),
    )
    committed = json.loads(
        (ROOT / "tools/evidence/operation-017d-evidence.json").read_text()
    )
    assert report == committed
