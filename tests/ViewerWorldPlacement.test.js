import test from "node:test";
import assert from "node:assert/strict";
import * as B from "@babylonjs/core";
import { WORLDS } from "../play/config/worlds.js";
import { viewerMt5ScenePlan, viewerMt7AreaRecords, viewerWorldForPrefix, viewerInteriorPrefix } from "../src/ViewerWorldPlan.js";
import { viewerExportNodes } from "../src/ViewerExportSelection.js";
import { appendViewerWorldPlacements } from "../src/rendering/ViewerWorldPlacements.js";
import { groupWorldPlacements, placementInitiallyEnabled } from "../src/rendering/WorldPlacementAssets.js";
import { clearWorldSceneAssets } from "../src/rendering/SceneResources.js";
import { ASSET_VIEWER_MAIN_VIEWS } from "../src/AssetViewerMainViews.js";
import catalog from "../public/models.json" with {type: "json"};

test("all reviewed MT5 area prefixes use the gameplay placement and environment policy", () => {
  const unique = new Set(Object.values(WORLDS).filter(w => !w.assetFormat && w.prefix).map(w => w.prefix));
  assert.ok(unique.size > 40);
  for (const prefix of unique) {
    const world = viewerWorldForPrefix(prefix);
    const plan = viewerMt5ScenePlan(prefix, catalog, {timeOfDayIndex: 0, seasonIndex: 0});
    assert.equal(plan.world, world, prefix);
    assert.equal(plan.placements, world.placements, prefix);
    const maps = catalog.filter(f => f.startsWith(prefix+"_") && (!plan.filenames || plan.filenames.has(f)) && (!plan.includeFile || plan.includeFile(f)));
    assert.ok(maps.length, prefix);
    for (const row of world.placements) {
      if (row.model.startsWith(prefix+"_")) {
        assert.ok(!maps.includes(row.model), `Duplicate loose asset ${prefix} ${row.model}`);
      }
    }
  }
  assert.equal(viewerInteriorPrefix("DGCT",new Set(["S1_DGCT","S3_DGCT"])),"S3_DGCT");
  assert.ok(ASSET_VIEWER_MAIN_VIEWS.some(v => v.prefix==="S1_JHD0"));
});

test("unknown areas with map geometry do not superimpose loose models", () => {
  const plan=viewerMt5ScenePlan("S2_TEST",["S2_TEST_MAP.MT5","S2_TEST_PROP.MT5"],{});
  assert.equal(plan.world,null);
  assert.equal(plan.includeFile("S2_TEST_MAP.MT5"),true);
  assert.equal(plan.includeFile("S2_TEST_PROP.MT5"),false);
});

test("MT7 full area selection follows native MAPM and PROP instead of loose CHRM", () => {
  const prefix=WORLDS.s2aka3.prefix;
  const records=[
    {filename:prefix+"_MAP.MAPM",kind:"MAPM",sourceMember:"MAP.MAPM"},
    {filename:prefix+"_PROP.PROP",kind:"PROP",sourceMember:"PROP.PROP"},
    {filename:prefix+"_ACT.CHRM",kind:"CHRM",sourceMember:"ACT.CHRM"},
  ];
  assert.deepEqual(viewerMt7AreaRecords(records,records),records.slice(0,2));
});

test("every placement group instantiates the recorded coordinates, with shared assets and initial visibility", async t => {
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose()});
  const state={scene,currentMeshes:[],currentTimeOfDay:0};
  const world=WORLDS.dobuita, reads=[];
  let scheduledWorld;
  await appendViewerWorldPlacements(state,world,()=>false,()=>{},{
    readAssets:async model=>{reads.push(model);return {modelBuffer:new ArrayBuffer(0),texturePack:null}},
    makeLoader:()=>({load:async()=>{
      const root=new B.TransformNode("fixture",scene); B.MeshBuilder.CreateBox("mesh",{},scene).parent=root;
      return [root];
    }}),
    scheduledRuntime:{workCount:()=>0,load:async id=>{scheduledWorld=id}},
  });
  assert.equal(reads.length,groupWorldPlacements(world.placements).length);
  assert.equal(scheduledWorld,world.id);
  assert.equal(state.currentMeshes.length,world.placements.length);
  assert.equal(state.viewerPlacementAudit.status,"verified");
  for (const root of state.currentMeshes) {
    const placement=root._runtimePlacementRecord;
    assert.deepEqual(root.position.asArray(),placement.position);
    assert.equal(root.isEnabled(),placementInitiallyEnabled(placement,world.id));
    if (placement.scale) assert.deepEqual(root.scaling.asArray(),placement.scale);
  }
  const exports=viewerExportNodes(state.currentMeshes);
  for (const root of state.currentMeshes) assert.equal(exports.has(root),root.isEnabled());
  clearWorldSceneAssets(state);
  assert.equal(state.currentMeshes.length,0);
  assert.equal(state.viewerPlacementAudit,null);
});

test("exports ignore helpers, inactive roots and hidden mesh variants", t => {
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose()});
  const root=new B.TransformNode("root",scene);
  const lamp=B.MeshBuilder.CreateBox("actual-light-fixture",{},scene);lamp.parent=root;
  const hidden=B.MeshBuilder.CreateBox("hidden",{},scene);hidden.parent=root;hidden.isVisible=false;
  const inactive=B.MeshBuilder.CreateBox("inactive",{},scene);inactive.setEnabled(false);
  const helper=B.MeshBuilder.CreateBox("sky",{},scene);
  const selected=viewerExportNodes([root,inactive]);
  assert.deepEqual([...selected], [root,lamp]);
  assert.ok(!selected.has(helper));
});
