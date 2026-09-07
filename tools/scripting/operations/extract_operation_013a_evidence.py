#!/usr/bin/env python3
"""Verify operation 0x013a's exact object +0x48 raw float-word write."""
from __future__ import annotations
import argparse, hashlib, json, struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-013a-evidence.json"
BASE = 0x0C010000
SHA = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER_SHA = "a39e2960c2211bb3ce10cdc3cd28950729bc5566f896201b918e5b265c47577f"

def at(data, address, size): return data[address-BASE:address-BASE+size]
def u32(data, address): return struct.unpack("<I", at(data,address,4))[0]

def build_report(data, ir):
    if hashlib.sha256(data).hexdigest() != SHA: raise ValueError("unexpected 1ST_READ.BIN")
    if (hashlib.sha256(at(data,0x0C1584B0,36)).hexdigest() != HANDLER_SHA
            or u32(data,0x0C29AEC8) != 0x0C1584B0
            or u32(data,0x0C1585BC) != 0x0C153956):
        raise ValueError("operation-0x013a native contract changed")
    calls=[]
    for item in ir["maps"]:
      for function in item["functions"]:
       for block in function["blocks"]:
        for action in block["actions"]:
         if action.get("kind")=="engineOperation" and action.get("operationId")==0x013A:
          calls.append((item["disc"],item["area"],function.get("dialogueRegion") is not None,action))
    first=Counter(c[3]["arguments"][0]["kind"] for c in calls)
    second=Counter(c[3]["arguments"][1]["kind"] for c in calls)
    unresolved=sum(any(a["kind"]=="runtime" for a in c[3]["arguments"]) for c in calls)
    if (len(calls)!=265 or len({c[:2] for c in calls})!=38 or sum(c[2] for c in calls)!=7
            or first!={"constant":233,"frame-field":23,"runtime":6,"scene-field":3}
            or second!={"constant":200,"frame-field":43,"runtime":13,"scene-field":9}
            or unresolved!=16 or any(len(c[3]["arguments"])!=2 or c[3].get("resultComparison") is not None
                                    or c[3].get("resultTarget") is not None for c in calls)):
        raise ValueError("operation-0x013a authored inventory changed")
    return {"schema":"new-yokosuka-operation-013a-evidence-v1","status":"exact-native-object-component-write-and-all-disc-inventory",
      "source":{"executable":"1ST_READ.BIN","executableSha256":SHA,"eventIr":".disc-work/dialogue/native-event-ir.json"},
      "operation":{"operationId":314,"operationHex":"0x013a","handlerAddress":"0x0c1584b0","handlerLength":36,
        "handlerSha256":HANDLER_SHA,"objectResolver":"0x0c153956","objectFloatWordOffset":"0x48",
        "provenBehavior":"Resolves argument zero and copies argument one's raw word to object +0x48; a missing object is a no-op."},
      "allDiscInventory":{"authoredCallCount":265,"areaCount":38,"dialogueRegionCallCount":7,
        "staticallyResolvableOperandCallCount":249,"unresolvedRuntimeOperandCallCount":16,
        "firstOperandKinds":dict(sorted(first.items())),"secondOperandKinds":dict(sorted(second.items()))},
      "evidenceBoundary":["Sixteen calls retain at least one unresolved runtime operand and fail closed until frame dataflow recovers them.",
        "The raw float32 word is not assigned inferred units."]}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--executable",type=Path,default=DEFAULT_EXECUTABLE);p.add_argument("--event-ir",type=Path,default=DEFAULT_EVENT_IR);p.add_argument("--out",type=Path,default=DEFAULT_OUTPUT);a=p.parse_args()
 r=build_report(a.executable.read_bytes(),json.loads(a.event_ir.read_text()));a.out.write_text(json.dumps(r,indent=2)+"\n");print(f"Wrote {a.out}: 265 proven calls")
if __name__=="__main__":main()
