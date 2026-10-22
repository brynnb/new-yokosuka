import assert from "node:assert/strict";
import test from "node:test";
import {ThirdPersonController} from "../src/ThirdPersonController.js";
import {createNativeSceneTransactionAdapter} from "../play/events/NativeEventAssembly.js";

function harness(failCleanup=false){
  const controller=Object.assign(Object.create(ThirdPersonController.prototype),{
    manualMovementLocked:false,movementLocked:false,movementLockOwners:new Set(),keys:new Set(),clearTouchMovement(){},
  });
  const resource={beginTransaction:()=>({}),commitTransaction(){},rollbackTransaction(){if(failCleanup)throw Error("cleanup failed");}};
  const adapter=createNativeSceneTransactionAdapter({
    getController:()=>controller,getRoomScripts:()=>({sceneState:{readNativeOperation0050Activity:()=>null,readActorXmptState:()=>null}}),
    eventCamera:resource,playerMotion:resource,playerXmpt:{...resource,update(){}},syncPlayerMomtState(){},
    mapClipState:resource,mapRenderPreparationState:resource,roomMusic:{...resource,endTransaction(){}},
    cameraPresentation:{captureForProgram:()=>false,clear(){}},
  });
  return {controller,adapter};
}

for(const ending of ["commit","rollback"])for(const outerFirst of [true,false])test(`native ${ending} releases only its own movement lock (${outerFirst?"outer":"native"} first)`,()=>{
  const {controller,adapter}=harness(),releaseOuter=controller.acquireMovementLock();
  const external=adapter.begin({program:{}});adapter.update({external,deltaSeconds:.1});
  assert.equal(controller.manualMovementLocked,false);
  if(outerFirst)releaseOuter();
  assert.equal(controller.movementLocked,true);
  adapter[ending]({external});
  assert.equal(controller.movementLocked,!outerFirst);
  releaseOuter();assert.equal(controller.movementLocked,false);
  const releaseNew=controller.acquireMovementLock();external.releaseMovementLock();assert.equal(controller.movementLocked,true);releaseNew();
});

test("failed native rollback releases its token and preserves an intentional manual lock",()=>{
  const {controller,adapter}=harness(true),external=adapter.begin({program:{}});
  controller.setMovementLocked(true);
  assert.throws(()=>adapter.rollback({external}),/cleanup failed/);
  assert.equal(controller.movementLockOwners.size,0);assert.equal(controller.movementLocked,true);
  controller.setMovementLocked(false);assert.equal(controller.movementLocked,false);
});
