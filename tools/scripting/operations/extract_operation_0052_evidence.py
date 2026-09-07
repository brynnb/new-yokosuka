#!/usr/bin/env python3
"""Verify operation 0x0052's exact indexed global-table write."""
from __future__ import annotations
import argparse,hashlib,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];DEFAULT_EXECUTABLE=ROOT/".disc-work/exact/1ST_READ.BIN";DEFAULT_EVENT_IR=ROOT/".disc-work/dialogue/native-event-ir.json";DEFAULT_OUTPUT=ROOT/"tools/evidence/operation-0052-evidence.json"
BASE=0x0C010000;SHA="ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
def at(d,a,n):return d[a-BASE:a-BASE+n]
def u32(d,a):return struct.unpack("<I",at(d,a,4))[0]
def build_report(data,ir):
 if hashlib.sha256(data).hexdigest()!=SHA:raise ValueError("unexpected 1ST_READ.BIN")
 if (hashlib.sha256(at(data,0x0C168EFC,26)).hexdigest()!="87a331cf4acb661139a43072a9e9902ba6f4224f40116c8b25f8b36bb6b79b20" or hashlib.sha256(at(data,0x0C0A66CE,22)).hexdigest()!="92f3ef5e4d70485b292dbc1d6ee144ad246d56554e5420bf764f3cacc8317e58" or u32(data,0x0C29AB28)!=0x0C168EFC or u32(data,0x0C16902C)!=0x0C153956 or u32(data,0x0C169050)!=0x0C0A66CE or u32(data,0x0C0A66F8)!=0x0C281AF8):raise ValueError("operation-0x0052 native contract changed")
 calls=[]
 for m in ir["maps"]:
  for f in m["functions"]:
   for b in f["blocks"]:
    for a in b["actions"]:
     if a.get("kind")=="engineOperation" and a.get("operationId")==0x52:calls.append((m["disc"],m["area"],f.get("dialogueRegion"),a))
 if len(calls)!=97 or len({c[:2] for c in calls})!=97 or any(c[2] is not None or len(c[3]["arguments"])!=3 or c[3]["arguments"][0]["kind"]!="frame-field" or c[3]["arguments"][1].get("value")!=32 or c[3]["arguments"][2].get("value")!=89 or c[3].get("resultComparison") is not None or c[3].get("resultTarget") is not None for c in calls):raise ValueError("operation-0x0052 authored inventory changed")
 return {"schema":"new-yokosuka-operation-0052-evidence-v1","status":"exact-native-indexed-table-write-and-all-disc-inventory","source":{"executable":"1ST_READ.BIN","executableSha256":SHA,"eventIr":".disc-work/dialogue/native-event-ir.json"},"operation":{"operationId":82,"operationHex":"0x0052","handlerAddress":"0x0c168efc","handlerLength":26,"helperAddress":"0x0c0a66ce","helperLength":22,"tableBasePointerGlobal":"0x0c281af8","entryStrideBytes":12,"entryPayloadOffsetBytes":36,"provenBehavior":"The helper ignores r4, computes base + 36 + index * 12, and writes the value dword."},"allDiscInventory":{"authoredCallCount":97,"areaCount":97,"index":32,"value":89,"ignoredFrameFieldOperandCallCount":97},"evidenceBoundary":["The object resolver result is observationally unused by the complete helper.","The table's gameplay-domain meaning remains unknown."]}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--executable",type=Path,default=DEFAULT_EXECUTABLE);p.add_argument("--event-ir",type=Path,default=DEFAULT_EVENT_IR);p.add_argument("--out",type=Path,default=DEFAULT_OUTPUT);a=p.parse_args();r=build_report(a.executable.read_bytes(),json.loads(a.event_ir.read_text()));a.out.write_text(json.dumps(r,indent=2)+"\n");print(f"Wrote {a.out}: 97 proven writes")
if __name__=="__main__":main()
