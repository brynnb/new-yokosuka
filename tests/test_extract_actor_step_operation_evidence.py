import importlib.util
import json
import unittest
from pathlib import Path

from tools.scripting.compile_native_event_ir import semantic_applies

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("actor_step", ROOT / "tools/scripting/operations/extract_actor_step_operation_evidence.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ActorStepEvidenceTest(unittest.TestCase):
    def test_source_contract_and_every_committed_call_binding(self):
        report = json.loads((ROOT / "tools/evidence/actor-step-operation-evidence.json").read_text())
        # Retain the real call operands without loading the 857 MiB full IR for
        # each small evidence test. The extractor itself audits that corpus.
        maps = [{"disc": c["disc"], "area": c["area"], "functions": [
            {"id": c["function"], "blocks": [{"actions": [
                {"kind": "engineOperation", "operationId": 245,
                 "callFileOffset": c["callFileOffset"], "arguments": c["arguments"]}]}]}]}
            for c in report["inventory"]["calls"]]
        executable = (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes()
        actual = MODULE.build_report(executable, {"maps": maps}, report["source"]["eventIrSha256"])
        self.assertEqual(actual, report)
        self.assertEqual(report["inventory"]["callCount"], 42)
        self.assertEqual(report["inventory"]["mapCount"], 28)
        self.assertEqual(report["operation"]["modeOffsets"], {"0": 1, "1": 2})
        registry = json.loads((ROOT / "tools/evidence/native-operation-semantics.json").read_text())
        semantic = next(s for s in registry["operations"] if s["operationId"] == 245)
        self.assertEqual(semantic["semanticId"], "actor-step-packed-byte-write")
        self.assertTrue(all(semantic_applies(semantic, c) for c in report["inventory"]["calls"]))
        self.assertFalse(semantic_applies(semantic, {"arguments": []}))
        changed = bytearray(executable)
        changed[0x0C16B3E0 - MODULE.BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ.BIN"):
            MODULE.build_report(changed, {"maps": maps}, "modified")


if __name__ == "__main__":
    unittest.main()
