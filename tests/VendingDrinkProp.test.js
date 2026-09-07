import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as B from "@babylonjs/core";
import {Mt5Loader} from "../src/Mt5Loader.js";
import {MotnLoader} from "../src/MotnLoader.js";
import {AnimationStateMachine} from "../play/characters/AnimationStateMachine.js";
import {VendingDrinkProp, VENDING_CAN_GRIP, VENDING_CAN_RELEASE_FRAME, VENDING_CAN_FLIGHT_FRAMES} from "../play/interactions/VendingDrinkProp.js";
import {vendingBinForMachine} from "../play/interactions/VendingInteractions.js";
import {VENDING_MANIFEST} from "../src/VendingCatalog.js";
import {RYO_YK_RENDER_MATRIX_ROUTES} from "../src/RuntimeMatrixRecording.js";

function bytes(path) {
  const b = fs.readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength);
}
const readAsset = async url => bytes(url.slice(url.indexOf("play/assets/")));
const [x,y,z] = VENDING_CAN_GRIP.translation;
const [rx,ry,rz] = VENDING_CAN_GRIP.rotationRaw.map(raw => raw * Math.PI / 32768);
const gripMatrix = B.Matrix.FromArray(Mt5Loader.sourceTransformMatrix({
  pos: {x,y,z}, rot: {x:rx,y:ry,z:rz}, scl: {x:1,y:1,z:1},
}));

test("native can follows the final rendered hand across poses, actor yaw and mirrored character space", {
  skip: !fs.existsSync("public/models/S2_YDB1_YKC_M.MT5") && "requires locally extracted Ryo model",
}, async () => {
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {characterRigMode: "baked", mirrorCharacterX: true});
    const [character] = await loader.load(bytes("public/models/S2_YDB1_YKC_M.MT5"));
    const actor = new B.TransformNode("actor", scene), offset = new B.TransformNode("offset", scene);
    offset.parent = actor; offset.rotation.y = Math.PI; offset.position.y = .003655;
    character.parent = offset;
    const prop = new VendingDrinkProp({scene, state: {currentMeshes: []}, modelOffset: offset,
      fetchArrayBuffer: readAsset, getCharacterRoot: () => character});
    const motion = MotnLoader.parse(bytes("play/assets/vending/M_DJUC.MOTN"));
    const animation = new AnimationStateMachine({});
    const hand = character._mt5Nodes.find(node => (node.flag << 16 >> 16) === -65);
    for (const resource of ["COKE", "CAFE", "ATRK"]) {
      await prop.prepare(resource);
      for (const [name, tick, state] of [["AKI_TORU_JUICE",90,"vendingDrink:loop"], ["AKI_NOMU_JUICE",300,"vendingDrink:exit"]]) {
        const clip = animation.buildClip(motion, name, {settleLoop: false});
        const frame = clip.frames[tick];
        loader.applyCharacterRigWorldMatrices(character, new Map(RYO_YK_RENDER_MATRIX_ROUTES.map(([key, index]) => [key, frame.poseMatrices[index]])));
        for (const yaw of [0, Math.PI, 4.032657]) {
          actor.rotation.y = yaw; actor.position.set(-16.02, 0, 27.61);
          prop.update(frame, frame, 0, state);
          const handMatrix = B.Matrix.FromArray(character._mt5CharacterWorldMatrices.get(hand.addr));
          const characterWorld = character._mt5CharacterContentRoot.computeWorldMatrix(true);
          const expected = B.Vector3.TransformCoordinates(new B.Vector3(.01,.02,.03), gripMatrix.multiply(handMatrix).multiply(characterWorld));
          // The generic prop loader already reflects its local geometry in X.
          const actual = B.Vector3.TransformCoordinates(new B.Vector3(-.01,.02,.03), prop.activeRoot.computeWorldMatrix(true));
          assert.ok(B.Vector3.Distance(actual, expected) < 1e-5, `${resource} ${name} yaw ${yaw}`);
          const wrist = B.Vector3.TransformCoordinates(B.Vector3.Zero(), handMatrix.multiply(characterWorld));
          assert.ok(B.Vector3.Distance(prop.activeRoot.getAbsolutePosition(), wrist) > .1, "can grip is beyond the wrist joint");
        }
      }
      prop.update(null, null, 0, "idle"); assert.equal(prop.activeRoot.isEnabled(), false);
    }
    prop.clear(); assert.equal(prop.roots.size, 0);
  } finally {engine.dispose();}
});

test("all registered machines target their actual embedded or separately placed bin", () => {
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  try {
    const binPlacement = JSON.parse(fs.readFileSync("play/data/jd00-runtime-placements.json")).placements.find(p => p.runtime?.objectTag === "VMG0");
    const separate = new B.TransformNode("VMG0", scene);
    separate._runtimePlacementRecord = binPlacement;
    separate.position.set(...binPlacement.position);
    for (const machine of VENDING_MANIFEST.machines) {
      const root = new B.TransformNode(machine.id, scene);
      root.position.set(...machine.position); root.rotation.y = machine.rotationDegrees[1] * Math.PI/180;
      const bin = vendingBinForMachine(machine, root, [separate]);
      if (machine.model.endsWith("JIHS5KRG.MT5")) {
        assert.equal(bin.root, separate);
        assert.deepEqual(bin.opening.asArray(), [0,.7256,0]);
        assert.throws(() => vendingBinForMachine(machine, root, []), /Missing authored vending bin VMG0/);
      } else {
        assert.equal(bin.root, root);
        const world = B.Vector3.TransformCoordinates(bin.opening, root.computeWorldMatrix(true));
        assert.ok(Math.abs(B.Vector3.Distance(world, root.position) - Math.hypot(.6966,.7256)) < 1e-5);
      }
    }
  } finally {engine.dispose();}
});

test("cold and hot throws detach exactly once, survive frame skips, land in the bin, and reset", async () => {
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  try {
    const character = new B.TransformNode("character", scene);
    const content = new B.TransformNode("content", scene); content.parent = character; content.scaling.x = -1;
    character._mt5CharacterContentRoot = content;
    character._mt5Nodes = [{addr: 1, flag: 0xffbf}];
    const binRoot = new B.TransformNode("bin", scene); binRoot.position.set(-17.95,.0724,25.969); binRoot.rotation.y = .46259;
    const bin = {root: binRoot, opening: new B.Vector3(-.6966,.7256,0)};
    const bank = MotnLoader.parse(bytes("play/assets/vending/M_DJUC.MOTN"));
    const builder = new AnimationStateMachine({});
    for (const [state, name, resource] of [["vendingDrink:exit","AKI_NOMU_JUICE","COKE"], ["vendingCoffee:exit","AKI_NOMU_JUICE_250","CAFE"]]) {
      const clip = builder.buildClip(bank, name, {settleLoop: false});
      const samples = [];
      const prop = new VendingDrinkProp({scene,state:{currentMeshes:[]},modelOffset:character,getCharacterRoot:()=>character,
        fetchArrayBuffer:readAsset, getCharacterPoseAt:(clipState, tick)=>{
          samples.push(tick); assert.equal(clipState,state);
          return new Map([[-65,clip.frames[tick].poseMatrices[36]]]);
        }});
      const draw = time => {
        const tick = Math.floor(time), amount = time-tick;
        const first = clip.frames[tick], next = clip.frames[tick+1] || first;
        const pose = B.Matrix.DecomposeLerp(B.Matrix.FromArray(first.poseMatrices[36]), B.Matrix.FromArray(next.poseMatrices[36]), amount);
        character._mt5CharacterWorldMatrices = new Map([[1, [...pose.asArray()]]]);
        prop.update(first,next,amount,state);
        return prop.activeRoot.getAbsolutePosition().clone();
      };
      character.position.set(-17.59,0,26.68); character.rotation.y = -.3;
      await prop.prepare(resource,{bin});
      const justBefore = draw(VENDING_CAN_RELEASE_FRAME - .00001);
      const released = draw(VENDING_CAN_RELEASE_FRAME);
      assert.ok(B.Vector3.Distance(justBefore,released) < 1e-5, "no handoff snap");
      assert.equal(prop.activeRoot.parent,null);
      draw(VENDING_CAN_RELEASE_FRAME + 6);
      const midpoint = prop.activeRoot.position.clone();
      character.position.x += 20; character.rotation.y += 2;
      draw(VENDING_CAN_RELEASE_FRAME + 6);
      assert.ok(B.Vector3.Distance(midpoint,prop.activeRoot.position) < 1e-6, "released can no longer follows actor");
      draw(VENDING_CAN_RELEASE_FRAME + VENDING_CAN_FLIGHT_FRAMES);
      assert.equal(prop.activeRoot.isEnabled(),false);
      const target = B.Vector3.TransformCoordinates(bin.opening,binRoot.computeWorldMatrix(true));
      assert.ok(B.Vector3.Distance(target,prop.activeRoot.position) < 1e-6);
      draw(714); assert.equal(prop.activeRoot.isEnabled(),false);
      assert.deepEqual(samples,[VENDING_CAN_RELEASE_FRAME]);
      prop.hide(); assert.equal(prop.flight,null);
      character.position.set(-17.59,0,26.68); character.rotation.y = -.3;
      await prop.prepare(resource,{bin});
      draw(VENDING_CAN_RELEASE_FRAME + 6); // jump straight over the release
      assert.ok(B.Vector3.Distance(midpoint,prop.activeRoot.position) < 1e-6);
      prop.clear(); assert.equal(prop.activeRoot,null); assert.equal(prop.flight,null);
    }
  } finally {engine.dispose();}
});

test("grip values agree with the original D000 FIXO literal pool", {
  skip: !fs.existsSync(".disc-work/exact/d000/MAPINFO.BIN") && "requires original disc extraction",
}, () => {
  const source = fs.readFileSync(".disc-work/exact/d000/MAPINFO.BIN");
  assert.deepEqual(VENDING_CAN_GRIP.translation,[0x893ac,0x893b0,0x893b4].map(offset=>source.readFloatLE(offset)));
  assert.deepEqual(VENDING_CAN_GRIP.rotationRaw,[0x893b8,0x893bc,0x893c0].map(offset=>source.readInt32LE(offset)));
});

test("clearing while a prop loads prevents stale roots from entering the next world", async () => {
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  try {
    let release; const gate = new Promise(resolve => {release = resolve;});
    const state = {currentMeshes: []};
    const prop = new VendingDrinkProp({scene, state, modelOffset: new B.TransformNode("offset", scene),
      fetchArrayBuffer: async url => {await gate; return readAsset(url);}, getCharacterRoot: () => null});
    const rejected = assert.rejects(prop.prepare("COKE"), {name: "AbortError"});
    prop.clear(); release(); await rejected;
    assert.equal(prop.activeRoot, null); assert.equal(state.currentMeshes.length, 0);
  } finally {engine.dispose();}
});
