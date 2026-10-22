import test from "node:test";
import assert from "node:assert/strict";
import {NullEngine,Scene,TransformNode} from "@babylonjs/core";
import {PlayForkliftAssembly} from "../play/forklift/PlayForkliftAssembly.js";
import {createForkliftChassisState} from "../src/ForkliftChassisDynamics.js";

test("real forklift assembly supplies the orientation callback used after dismount",()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try{
    const assembly=new PlayForkliftAssembly({scene,sceneState:{currentMeshes:[]},getWorld:()=>({id:"mfsy"}),
      raceWorld:{id:"ma00race",forkliftSpawns:[]},race:{},getController:()=>null,
      actorRoot:new TransformNode("actor",scene),chassisPose:new TransformNode("chassis",scene),modelOffset:new TransformNode("model",scene)});
    assert.equal(typeof assembly.network.orientationQuaternion,"function");
    const q=assembly.network.orientationQuaternion(Math.PI/2,createForkliftChassisState());
    assert.ok(Math.abs(q.y-Math.sin(Math.PI/4))<1e-6);
    assert.ok(Math.abs(q.w-Math.cos(Math.PI/4))<1e-6);
  }finally{engine.dispose();}
});
