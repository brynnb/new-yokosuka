import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {NullEngine, Scene, TransformNode} from "@babylonjs/core";
import {createServer} from "vite";
import {MotnLoader} from "../src/MotnLoader.js";
import {RYO_YK_RENDER_MATRIX_ROUTES} from "../src/RuntimeMatrixRecording.js";
import {parseIpacActivityArchive} from "../tools/lib/NativeAseqActivityPack.mjs";
import {CharacterRuntime} from "../play/characters/CharacterRuntime.js";
import {ScheduledActorMotionRuntime} from "../play/characters/ScheduledActorMotionRuntime.js";
import {createNativeCutsceneCharacterLoader} from "../play/cutscenes/NativeCutsceneCharacterLoader.js";
import {NativeAseqBabylonActors} from "../play/events/NativeAseqBabylonPresentation.js";
import {NativeAseqSceneObjectRuntime} from "../play/events/NativeAseqSceneObjectRuntime.js";
import {NativeAseqPackageActorRuntime} from "../play/events/NativeAseqPackageActorRuntime.js";

const prefix = "play/assets/hazuki/chai-home-recovery/";
const manifest = JSON.parse(fs.readFileSync(prefix+"manifest.json"));
const disc = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2","data/SCENE/02");
const read = file => Uint8Array.from(fs.readFileSync(file)).buffer;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("the A0173 native owner changes AKIR to the room archive's YKD body before slot 16", {
  skip: !fs.existsSync(path.join(disc,"JOMO/COMMON02.PKS")) && "requires the original Disc 2 room",
}, () => {
  const b = fs.readFileSync(path.join(disc,"JOMO/MAPINFO.BIN"));
  // PC-relative SH-4 loads for actor, image pointer and engine operation.
  const literal = pc => {
    const instruction = b.readUInt16LE(pc);
    assert.equal(instruction >>> 12,13);
    return b.readUInt32LE(((pc+4)&~3)+(instruction&255)*4);
  };
  assert.equal(b.readUInt16LE(0x609a6),0x400b);
  assert.equal(literal(0x60998),Buffer.from("AKIR").readUInt32LE());
  assert.equal(literal(0x609a0),0x008f);
  const scn3 = b.indexOf("SCN3");
  const stringBase = scn3 + b.readUInt32LE(scn3 + 16);
  assert.equal(b.toString("ascii",stringBase+literal(0x60994),stringBase+literal(0x60994)+6),"YKD_M\0");
  assert.equal(b.readUInt16LE(0x60ada),0xe410);
  assert.equal(b.readUInt16LE(0x60ade),0xe550);
  assert.equal(literal(0x60c60),Buffer.from("FUT2").readUInt32LE());
  assert.equal(literal(0x60c8c),0xc1200000); // -10.0f placed in the new vector's Y field
  assert.equal(literal(0x60cae),Buffer.from("FUT2").readUInt32LE());
  assert.equal(b.readUInt16LE(0x60cbc),0x400b);
  assert.equal(b.readUInt16LE(0x60f8c),0x400b);
  const ar = parseIpacActivityArchive(fs.readFileSync(path.join(disc,"JOMO/COMMON02.PKS")));
  const body = ar.members.find(member=>member.name==="YKD_M.CHRM");
  assert.equal(sha(body.bytes),sha(fs.readFileSync(manifest.packageActors.AKIR.assetPath)));
  const face = manifest.facialAssets.AKIR;
  assert.equal(sha(fs.readFileSync(path.join(disc,"MODEL/FACE/YKD_F.MT5"))),face.model.sha256);
  assert.equal(sha(ar.members.find(member=>member.name==="YKD_FTBL.BIN").bytes),face.table.sha256);
  const fuku = fs.readFileSync(path.join(disc,"MODEL/CHARA/FUK_M.MT5"));
  const fukuGeometry = fuku.subarray(0,fuku.indexOf("TEXN"));
  assert.deepEqual(fs.readFileSync(manifest.packageActors.FUKU.assetPath).subarray(0,fukuGeometry.length),fukuGeometry);
});

test("the recovery film animates the leased YKD body and restores the ordinary Ryo", async () => {
  const vite = await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:"custom",logLevel:"error"});
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const {NATIVE_CUTSCENE_PACKAGES} = await vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js");
    const pkg = NATIVE_CUTSCENE_PACKAGES.find(candidate=>candidate.id==="chai-home-recovery");
    assert.equal(pkg.presentation.facialAssets.AKIR.faceCode,"YKD");
    assert.equal(pkg.presentation.facialAssets.FUKU.faceCode,"FUK");
    const cast = new NativeAseqPackageActorRuntime({definitions:pkg.environment.packageActors,
      instantiate:createNativeCutsceneCharacterLoader({scene,loadAsset:async file=>read(file)})});
    assert.equal(await cast.load(),2);
    const character = new CharacterRuntime({scene,renderMatrixByKey:new Map(RYO_YK_RENDER_MATRIX_ROUTES),fetchArrayBuffer:async file=>read(file)});
    const reference = await character.createModel({label:"Ryo",modelCode:"YKC_M",modelUrl:"public/models/S2_YDB1_YKC_M.MT5"});
    character.setReferenceBind(reference.loader,reference.root);
    const motion = new ScheduledActorMotionRuntime({characterRuntime:character,renderMatrixByKey:character.renderMatrixByKey,bankUrls:{},fetchArrayBuffer:read});
    const ordinaryRoot = new TransformNode("ordinary",scene);
    reference.root.parent=ordinaryRoot;
    ordinaryRoot.position.set(1,2,3);
    const actors = new NativeAseqBabylonActors({...pkg.actors,packageActors:cast,motionRuntime:motion,
      getPlayerModel:()=>({root:ordinaryRoot,renderRoot:reference.root}),syncPlayerTransform:()=>assert.fail("Moved ordinary Ryo"),
      scheduledActors:{beginActivityActors:()=>[],activityActor:()=>null,endActivityActors:()=>true}});
    const owner = {}, film = manifest.activities[0], bank=MotnLoader.parse(read(prefix+"M_0173.MOTN"),{sequenceIndexBase:128});
    for (const end of ["cancel","complete"]) {
      assert.equal(actors.begin(owner,film.actors),true);
      const ryo=actors.activeActor("AKIR");
      assert.equal(ryo.model.modelCode,"YKD_M");
      assert.ok(ryo.model.renderRoot.getChildMeshes().some(mesh=>mesh.isEnabled()&&mesh.getTotalVertices()>0));
      assert.equal(reference.root.isEnabled(),false);
      const poses=[];
      for (const cue of film.motions.filter(cue=>cue.actorTag==="AKIR")) {
        assert.equal(actors.applyMotion(owner,"AKIR",{sequence:bank.sequences.find(seq=>seq.index===cue.sequenceIndex),frame:cue.startFrame-1}),true);
        poses.push(Array.from(ryo.model.latestRetargetedRoutes.values()).flatMap(matrix=>Array.from(matrix)));
      }
      assert.notDeepEqual(poses[0],poses[1]);
      assert.equal(actors.end(owner,end),true);
      assert.equal(ryo.root.isEnabled(),false);
      assert.equal(reference.root.isEnabled(),true);
      assert.deepEqual(ordinaryRoot.position.asArray(),[1,2,3]);
    }
    cast.clear();
  } finally {
    scene.dispose();engine.dispose();await vite.close();
  }
});


test("the native FUT2 callback lowers only the resident cover and restores the original placement", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const placements = JSON.parse(fs.readFileSync("play/data/jomo-runtime-placements.json")).placements;
    const roots = Object.fromEntries(["FUT1","FUT2"].map(tag => {
      const placement = placements.find(row=>row.runtime?.objectTag===tag);
      const root = new TransformNode(tag,scene);
      root._filename=placement.model;
      root.metadata={runtimeObject:{objectTag:tag}};
      root.position.set(...placement.position);
      return [tag,root];
    }));
    const start = Object.fromEntries(Object.entries(roots).map(([tag,root])=>[tag,root.position.asArray()]));
    const stage = new NativeAseqSceneObjectRuntime({definitions:manifest.sceneObjects});
    assert.equal(await stage.load(Object.values(roots)),1);
    for (let run=0;run<2;run++) {
      assert.equal(stage.prepareActivity(manifest.activities[0]),true);
      assert.deepEqual(roots.FUT2.position.asArray(),[start.FUT2[0],-10,start.FUT2[2]]);
      assert.deepEqual(roots.FUT1.position.asArray(),start.FUT1);
      assert.equal(stage.releaseStandaloneObjects(),true);
      for (const [tag,root] of Object.entries(roots)) {
        assert.deepEqual(root.position.asArray(),start[tag]);
        assert.equal(root.isEnabled(),true);
      }
    }
  } finally {
    scene.dispose();engine.dispose();
  }
});
