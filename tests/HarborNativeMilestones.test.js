import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import source from "../tools/scripting/story-investigation.json" with {type:"json"};
import regions from "../play/data/story-regions.json" with {type:"json"};

const mapPath=resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2","data/SCENE/02/MFSY/MAPINFO.BIN");

test("harbor arrival and Goro success advance the same STEP for new and older Story saves",()=>{
  for(const [name,bit] of [["harbor-bus",210],["harbor-bus-revisit",210],["goro-harbor-encounter",220]]){
    const route=source.routes.find(route=>route.id===name);
    assert.deepEqual(route.nativeEffects,[{address:"2:"+bit,value:1}]);
    if(!route.repeatable)assert.equal(regions.nativeStepReceipts[bit],route.completedFlag);
  }
});

test("the original harbor map entry and Goro E1046 controller set the upper Story milestones",{skip:!existsSync(mapPath)},()=>{
  const bytes=readFileSync(mapPath);
  const digest=createHash("sha256").update(bytes).digest("hex");
  assert.equal(bytes.toString("ascii",8,12),"SCN3");
  assert.equal(bytes.readUInt32LE(0x14)+8,0x72d48);
  for(const [name,pc,bit] of [["harbor-bus",0x72f0a,210],["goro-harbor-encounter",0x8aa84,220]]){
    const route=source.routes.find(route=>route.id===name);
    assert.equal(route.nativeSources.find(src=>src.role==="harbor-story-step-director").sha256,digest);
    const arg=bytes.readUInt16LE(pc-16);
    assert.equal(arg>>>8,0xd5);
    assert.equal(bytes.readUInt32LE(((pc-12)&~3)+(arg&255)*4),bit);
    assert.equal(bytes.readUInt16LE(pc-18),0xe401);
    assert.equal(bytes.readUInt16LE(pc-14),0xe60c);
    assert.equal(bytes.readUInt16LE(pc-6),0xe551);
    assert.equal(bytes.readUInt16LE(pc),0x400b);
  }
});
