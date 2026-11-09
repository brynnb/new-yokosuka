import test from "node:test";
import assert from "node:assert/strict";
import {NullEngine, Scene, Mesh, Vector3} from "@babylonjs/core";
import {applyStoryObjectTransforms, StoryObjectPresentation} from "../play/scripts/StoryObjectPresentation.js";

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const roots = ["KAK2", "KAK1", "SKAB"].map(tag => {
    const root = new Mesh(tag, scene);
    root._runtimePlacementRecord = {runtime: {objectTag: tag}};
    root.position.copyFromFloats(11, 2, -22);
    return root;
  });
  return {engine, roots};
}

test("personal switch presentation restores across mode/character/world changes without accumulating offsets", () => {
  const {engine, roots} = fixture();
  let character = {id: 1, playMode: "story", openingCompleted: true, storyFlags: {}};
  const runtime = new StoryObjectPresentation({getCharacter: () => character});
  try {
    runtime.load("JHD0", roots);
    character.storyFlags["story.s1.dojo-handguard-switch.completed"] = true;
    runtime.update();
    assert.equal(roots[0].isEnabled(false), false);
    assert.equal(roots[1].isEnabled(false), true);
    character.storyFlags["story.s1.dojo-sword-switch.completed"] = true;
    runtime.update(); runtime.update();
    assert.equal(roots[1].isEnabled(false), false);
    assert.equal(roots[2].position.z, -19.85);
    character = {id: 2, playMode: "story", openingCompleted: true, storyFlags: {}};
    runtime.update();
    assert.ok(roots.every(root => root.isEnabled(false)));
    assert.equal(roots[2].position.z, -22);
    character.storyFlags["story.s1.dojo-sword-switch.completed"] = true;
    runtime.update(); character.playMode = "free_roam"; runtime.update();
    assert.ok(roots.every(root => root.isEnabled(false)));
    assert.equal(roots[2].position.z, -22);
    runtime.clear();
    assert.equal(runtime.roots.length, 0);
  } finally {engine.dispose();}
});

test("kitchen food hides only for the Story character who picked it up", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const roots = ["knib", "kmil"].map(tag => {
    const root = new Mesh(tag, scene);
    root._runtimePlacementRecord = {runtime:{objectTag:tag}};
    return root;
  });
  let character = {id:1, playMode:"story", openingCompleted:true, storyFlags:{}};
  const runtime = new StoryObjectPresentation({getCharacter:()=>character});
  try {
    runtime.load("JOMO", roots);
    character.storyFlags["story.s1.kitten-fish.completed"] = true;
    runtime.update();
    assert.equal(roots[0].isEnabled(false),false);
    assert.equal(roots[1].isEnabled(false),true);
    character.storyFlags["story.s1.kitten-milk.completed"] = true;
    runtime.update();
    assert.equal(roots[1].isEnabled(false),false);
    character = {id:2, playMode:"story", openingCompleted:true, storyFlags:{}};
    runtime.update();
    assert.ok(roots.every(root=>root.isEnabled(false)));
    character.storyFlags["story.s1.kitten-fish.completed"] = true;
    character.playMode = "free_roam";
    runtime.update();
    assert.ok(roots.every(root=>root.isEnabled(false)));
  } finally {runtime.clear(); engine.dispose();}
});

test("the adopted kitten leaves the shrine only in its owner's Story", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const cat = new Mesh("cat", scene);
  cat._runtimePlacementRecord = {runtime:{objectTag:"CATM"}};
  let character = {id:1, playMode:"story", openingCompleted:true, storyFlags:{}};
  const runtime = new StoryObjectPresentation({getCharacter:()=>character});
  try {
    runtime.load("JU00", [cat]);
    assert.equal(cat.isEnabled(false), true);
    character.storyFlags["story.s1.kitten-adopted.completed"] = true;
    runtime.update();
    assert.equal(cat.isEnabled(false), false);
    character.playMode = "free_roam"; runtime.update();
    assert.equal(cat.isEnabled(false), true);
    character = {id:2, playMode:"story", openingCompleted:true, storyFlags:{}};
    runtime.update();
    assert.equal(cat.isEnabled(false), true);
  } finally {runtime.clear(); engine.dispose();}
});

test("the personal kitten interaction uses the original mesh and never intercepts Free roam", () => {
  const character={id:1,playMode:"story",openingCompleted:true,storyFlags:{"story.s1.first-kitten.completed":true}};
  const runtime=new StoryObjectPresentation({getCharacter:()=>character,rules:[]});
  const root={_filename:"S1_JU00_KC1_M.MT5"},mesh={parent:root};
  const pick={hit:true,pickedMesh:mesh,pickedPoint:new Vector3(34.7,2.7,38.5)};
  runtime.load("JU00",[]);
  assert.equal(runtime.pickSurface(pick)?.objectTag,"CATM");
  character.storyFlags["story.s1.kitten-nozomi.completed"]=true;runtime.update();
  assert.equal(runtime.pickSurface(pick),null);
  delete character.storyFlags["story.s1.kitten-nozomi.completed"];character.playMode="free_roam";runtime.update();
  assert.equal(runtime.pickSurface(pick),null);
  runtime.clear();
});

test("a missing kitten moves only for its Story owner and returns when found",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cat=new Mesh("cat",scene);
  cat._runtimePlacementRecord={runtime:{objectTag:"CATM"}};cat.position.copyFromFloats(34.670799255371094,2.615000009536743,38.51959991455078);
  const character={id:1,playMode:"story",openingCompleted:true,storyFlags:{"story.s1.first-kitten.completed":true}};
  const runtime=new StoryObjectPresentation({getCharacter:()=>character});
  try{
    runtime.load("JU00",[cat]);character.storyFlags["story.s1.kitten-missing.completed"]=true;runtime.update();
    assert.ok(Math.abs(cat.position.x-30.5)<1e-6);assert.ok(Math.abs(cat.position.y-.91)<1e-6);assert.ok(Math.abs(cat.position.z-72.8)<1e-6);
    character.storyFlags["story.s1.kitten-found.completed"]=true;runtime.update();assert.ok(Math.abs(cat.position.z-38.51959991455078)<1e-6);
    delete character.storyFlags["story.s1.kitten-found.completed"];character.playMode="free_roam";runtime.update();assert.ok(Math.abs(cat.position.z-38.51959991455078)<1e-6);
    character.playMode="story";runtime.update();character.storyFlags["story.s1.kitten-adopted.completed"]=true;runtime.update();assert.equal(cat.isEnabled(false),false);assert.ok(Math.abs(cat.position.z-38.51959991455078)<1e-6);
  }finally{runtime.clear();engine.dispose();}
});

test("inspection transforms restore cancellation and reject missing/ambiguous/invalid targets before mutation", () => {
  const {engine, roots} = fixture();
  try {
    const restore = applyStoryObjectTransforms(roots, [{object: "KAK2", visible: false}, {object: "SKAB", offset: [0, 0, 2]}]);
    assert.equal(roots[0].isEnabled(false), false); assert.equal(roots[2].position.z, -20);
    restore(); assert.equal(roots[0].isEnabled(false), true); assert.equal(roots[2].position.z, -22);
    for (const transforms of [[{object: "missing"}], [{object: "KAK2", offset: [NaN, 0, 0]}]]) {
      assert.throws(() => applyStoryObjectTransforms(roots, [{object: "KAK2", visible: false}, ...transforms]));
      assert.equal(roots[0].isEnabled(false), true);
    }
    assert.throws(() => applyStoryObjectTransforms([...roots, roots[0]], [{object: "KAK2"}]), /found 2/);
    assert.ok(roots[2].position.equals(new Vector3(11, 2, -22)));
  } finally {engine.dispose();}
});

test("logical Story surfaces require the correct real mesh, picked point, personal mode and milestones", () => {
  let character = {id:1,playMode:"story",openingCompleted:true,storyFlags:{"story.s1.basement-visited":true}};
  const runtime = new StoryObjectPresentation({getCharacter:()=>character,rules:[]});
  const mesh = {_filename:"S2_YDB1_MAP.MT5"};
  runtime.load("YDB1",[]);
  const pick = point => ({hit:true,pickedMesh:mesh,pickedPoint:new Vector3(...point)});
  assert.equal(runtime.pickSurface(pick([-6,0,2])).objectTag,"FLOR");
  assert.equal(runtime.pickSurface(pick([-4,0,2])),null);
  assert.equal(runtime.pickSurface({...pick([-6,0,2]),pickedMesh:{_filename:"S2_YDB1_MAP01.MT5"}}),null);
  assert.equal(runtime.pickSurface(pick([-8,1,2])),null);
  character.storyFlags["story.s1.basement-floor.completed"] = true;
  character.storyFlags["story.s1.basement-shelf.completed"] = true;
  runtime.update();
  assert.equal(runtime.pickSurface(pick([-6,0,2])),null);
  assert.equal(runtime.pickSurface(pick([-8,1,2])).objectTag,"WALL");
  character.playMode = "free_roam"; runtime.update(); assert.equal(runtime.isSurfaceMesh(mesh),false);
  character = {id:2,playMode:"story",openingCompleted:true,storyFlags:{}};
  runtime.update(); assert.equal(runtime.isSurfaceMesh(mesh),false);
  runtime.clear(); assert.equal(runtime.isSurfaceMesh(mesh),false);
});

test("authored surfaces reject malformed data and ambiguous hits rather than guessing",()=>{
  const surface={area:"ROOM",object:"WALL",models:["room"],min:[0,0,0],max:[1,1,1],requiredFlags:[],excludedFlags:[]};
  assert.throws(()=>new StoryObjectPresentation({getCharacter:()=>null,surfaces:[{...surface,max:[NaN,1,1]}]}),/Invalid Story surface/);
  for(const invalid of [{area:"unknown"},{models:[null]},{requiredFlags:[false]}])assert.throws(()=>new StoryObjectPresentation({getCharacter:()=>null,surfaces:[{...surface,...invalid}]}),/Invalid Story surface/);
  const runtime=new StoryObjectPresentation({getCharacter:()=>({playMode:"story",openingCompleted:true}),rules:[],surfaces:[surface,surface]});
  runtime.load("ROOM",[]);
  assert.throws(()=>runtime.pickSurface({hit:true,pickedMesh:{_filename:"room"},pickedPoint:new Vector3(.5,.5,.5)}),/Ambiguous/);
});
