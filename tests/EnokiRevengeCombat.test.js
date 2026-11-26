import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import catalog from "../play/data/story-combat.json" with {type:"json"};

const mapPath=resolve(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || "extracted_files","data/SCENE/01/D000/MAPINFO.BIN");
const fight=catalog.encounters.find(encounter=>encounter.id==="s1.d000.enoki-revenge");

test("revenge uses the original five fighters and four opponent models",()=>{
  assert.deepEqual(fight.actors.map(a=>a.tag),["AKIR","NGSM","ENKI","TMNY","MYTY"]);
  assert.deepEqual(Object.fromEntries(fight.actorDefinitions.map(a=>[a.actorCode,a.modelCode])),
    {NGSM:"YAB_L",ENKI:"YAA_L",TMNY:"YAC_L",MYTY:"YAE_L"});
  assert.equal(fight.musicTrack,"bgm013");
});

test("original Dobuita room supplies revenge health and BASE-relative positions",{skip:!existsSync(mapPath)},()=>{
  const bytes=readFileSync(mapPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),fight.roomFight.sha256);
  function constant(pc){
    const op=bytes.readUInt16LE(pc);
    if(op>>>12===14)return op&0xff;
    assert.equal(op>>>12,13,"expected a PC-relative longword load at "+pc.toString(16));
    return bytes.readUInt32LE(((pc+4)&~3)+4*(op&0xff));
  }
  function float(pc){
    const b=Buffer.alloc(4);b.writeUInt32LE(constant(pc));return b.readFloatLE();
  }
  function tag(pc){
    const b=Buffer.alloc(4);b.writeUInt32LE(constant(pc));return b.toString("ascii");
  }
  const anchor=0x64338;
  assert.equal(tag(anchor-12),"BASE");
  const baseX=float(anchor-20),baseZ=float(anchor-22);
  const registrations=[
    {pose:0x65c44,tag:0x65e7a,hp:0x65eb2}, {pose:0x65c64,tag:0x65f22,hp:0x65f5a},
    {pose:0x65c84,tag:0x66252,hp:0x6628a}, {pose:0x65ca4,tag:0x6611a,hp:0x66152},
    {pose:0x65cc4,tag:0x6601e,hp:0x66056},
  ];
  for(const record of registrations){
    const id=tag(record.tag),actor=fight.actors.find(a=>a.tag===id);
    assert.equal(tag(record.pose-12),id);
    assert.equal(tag(record.pose-16),"BASE");
    assert.equal(actor.health,constant(record.hp));
    assert.equal(actor.x,-Math.fround(baseX+float(record.pose-20)));
    assert.equal(actor.y,bytes.readFloatLE(0x639e8));
    assert.equal(actor.z,Math.fround(baseZ+float(record.pose-22)));
  }
});
