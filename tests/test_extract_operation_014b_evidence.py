import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/scripting/operations/extract_operation_014b_evidence.py"
SPEC = importlib.util.spec_from_file_location("extract_operation_014b_evidence", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_committed_operation_014b_evidence_is_reproducible():
    report = MODULE.build_report(
        MODULE.DEFAULT_EXECUTABLE.read_bytes(),
        json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
    )
    committed = json.loads(MODULE.DEFAULT_OUTPUT.read_text(encoding="utf-8"))
    assert report == committed
    assert report["allDiscInventory"]["authoredCallCount"] == 16
    assert report["allDiscInventory"]["routeCounts"] == {
        "1": 3,
        "2": 2,
        "6": 3,
        "7": 6,
        "8": 2,
    }


def test_operation_014b_evidence_pins_native_ownership_semantics():
    report = MODULE.build_report(
        MODULE.DEFAULT_EXECUTABLE.read_bytes(),
        json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
    )
    operation = report["operation"]
    assert operation["handlerAddress"] == "0x0c16360a"
    assert operation["helperAddress"] == "0x0c17f6a2"
    assert operation["modeAddress"] == "0x0c224dd2"
    assert operation["dependentAddress"] == "0x0c224dd3"
