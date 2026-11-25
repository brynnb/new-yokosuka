import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { evaluateAuthActor } from "../src/AuthMovement.js";
import { rowMultiply, sourceTransformMatrix } from "../src/Mt5Transform.js";
import { parseTmnmMotion, sampleTmnmSequence } from "../src/TmnmMotion.js";

const read = path => fs.readFileSync(new URL("../"+path,import.meta.url));
const chapter = JSON.parse(read("play/data/story-dojo-scroll.generated.json"));
const [stool, discovery] = chapter.scenes;
const id = "s1.jhd0.mysterious-scroll-reveal";
const bank = read(chapter.motionBanks.dojoScroll);
const motion = parseTmnmMotion(bank, {sequenceIndices:[54,55]});
const matrix = (x,y,z,rx,ry,rz) => sourceTransformMatrix({
  pos:{x,y,z}, rot:{x:rx,y:ry,z:rz}, scl:{x:1,y:1,z:1},
});
const rad = Math.PI / 180;
const track = discovery.sceneObjectTracks.GART;

test("the mixed JHD0 motion bank exposes only the requested original 7055 and 7056 prop streams", () => {
  assert.deepEqual(motion.sequences.map(s => [s.index,s.name,s.durationFrames,s.nodeCount]), [
    [54,"TMN_GART_01",144,1],[55,"TMN_GART_02",85,1],
  ]);
  assert.throws(() => parseTmnmMotion(bank,{sequenceIndices:[50]}), /invalid node stream/);
  for(const index of [-1,77,0.5])assert.throws(() => parseTmnmMotion(bank,{sequenceIndices:[index]}), /outside its bank/);
  const firstEnd = sampleTmnmSequence(motion,motion.sequences[0],144);
  assert.deepEqual(sampleTmnmSequence(motion,motion.sequences[1],0),firstEnd);
  assert.deepEqual(sampleTmnmSequence(motion,motion.sequences[1],85),sampleTmnmSequence(motion,motion.sequences[0],0));
});

test("the staged plaque follows each original node sample and preserves the native placement cuts", () => {
  const floor=discovery.sceneObjects.GART.initialPresentation.position;
  assert.deepEqual(floor,[-6.7998,3.484,-16.5422]);
  const wall=evaluateAuthActor(track,90/30);
  assert.ok(Math.abs(wall.z+16.58)<1e-5);
  assert.ok(Math.abs(evaluateAuthActor(track,89.999/30).z-floor[2])<1e-6);
  assert.ok(Math.abs(evaluateAuthActor(track,645.999/30).z-wall.z)<1e-6);
  assert.ok(Math.abs(evaluateAuthActor(track,646/30).z-floor[2])<1e-6);
  const anchor=matrix(wall.x,wall.y,wall.z,0,Math.PI,0);
  for(const [index,start] of [120,560].entries()){
    const clip=motion.sequences[index];
    for(let frame=0;frame<=clip.durationFrames;frame+=0.5){
      const [n]=sampleTmnmSequence(motion,clip,frame);
      const expected=rowMultiply(matrix(n.tx,n.ty,n.tz,n.rx,n.ry,n.rz),anchor);
      const p=evaluateAuthActor(track,(start+frame)/30);
      const actual=matrix(p.x,p.y,p.z,p.rotationX*rad,p.rotationY*rad,p.rotationZ*rad);
      assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-6),clip.name+" frame "+frame);
    }
  }
  assert.deepEqual(evaluateAuthActor(track,265/30),evaluateAuthActor(track,559/30));
});

test("the stool prelude starts partway into motion 7025 and hands the same source model to wrist 12", () => {
  assert.equal(stool.id,id+"-stool");assert.equal(discovery.id,id);
  assert.equal(stool.actors[0].motion.name,"AKI_MOTU_DAI_TIKATANSAKU_0100");
  assert.equal(stool.actors[0].motionStartSeconds,60/30);
  assert.equal(stool.durationSeconds,(120-60)/30);assert.equal(stool.useGameplayCamera,true);
  const prop=stool.attachedObjects.HAKO;
  assert.equal(prop.assetPath,discovery.sceneObjects.HAKO.assetPath);
  assert.deepEqual(prop.worldTransforms[0].position.map(v=>+v.toFixed(3)),[-9.9,.96,-17.7]);
  assert.deepEqual(prop.attachments.map(c=>[c.frame,c.controlId,c.action]),[[34,12,undefined],[60,undefined,"detach"]]);
  assert.deepEqual(prop.attachments[0].rotationRaw,[0,182,10555]);
});
