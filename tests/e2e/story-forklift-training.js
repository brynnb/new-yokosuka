import {expect} from "@playwright/test";
import {readFileSync} from "node:fs";

const deliveryChallenges=JSON.parse(readFileSync(new URL("../../play/data/story-challenges.json",import.meta.url),"utf8")).challenges;

export async function verifyForkliftTraining(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),completed="story.s1.forklift-training.completed";
  expect(initial.character.storyFlags["story.s1.harbor-job-hiring.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unchanged=async()=>{const state=await saved();expect(state.character.yen).toBe(initial.character.yen);expect(state.inventory).toEqual(initial.inventory);expect(state.character.storyFlags[completed]).not.toBe(true);};
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching);
  if(await page.getByRole("button",{name:"Leave it for now",exact:true}).isVisible())await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-20,0,117]),-Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const start=async()=>{await approach();await page.getByRole("button",{name:"Start forklift practice",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();await page.waitForTimeout(1800);};
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  await start();await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("forklift-training-ready.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-training-cancel"));await idle();await unchanged();
  expect(await page.evaluate(()=>window.storyProbe.delivery.active)).toBe(null);
  await start();await page.locator("#renderCanvas").focus();
  await driveObservedDeliveries(page,testInfo,3,"forklift-training");
  await idle();const final=await saved();expect(final.character.storyFlags[completed]).toBe(true);expect(final.character.storyFlags["notebook.s1.first-workday"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(17);expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.delivery.getForklifts().mode.driving)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("forklift-training-earned-completion.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[completed]).toBe(true);
}

// Training and paid batches use the same actual keyboard/cargo boundary. Only
// the authored quota changes; neither helper can manufacture a delivered crate.
export async function driveObservedDeliveries(page,testInfo,count,prefix){
  const info=()=>page.evaluate(()=>{const r=window.storyProbe.delivery,a=r.getForklifts();if(!r.active||!a.mode.driving)return null;const v=r.active.prompt.delivery,c=a.cargo.physics.entries.get(v.cargoId),p=a.cargo.physics.dynamicForkliftPose(a.mode.activeId);if(!p)return null;return{view:v,challengeId:r.active.prompt.id,position:a.mode.actorRoot.position.asArray(),yaw:a.mode.actorRoot.rotation.y,velocity:p.linearVelocity.asArray(),speed:a.mode.state.speed,lift:a.mode.state.lift,physicalLift:p.forkLift,cargo:c?.node.position.asArray(),support:c?.forkSupportActive};});
  // Read-only evidence for pickup misses; use the actual support-probe poses,
  // whose rig frame differs from the dynamic chassis frame.
  const pickupDiagnostic=(delayMs=0)=>page.evaluate(async delayMs=>{
    const rules=await import("/src/ForkliftCargoRules.js");
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    const r=window.storyProbe.delivery,a=r.getForklifts(),physics=a.cargo.physics;
    const cargoId=r.active?.prompt.delivery.cargoId,c=physics.entries.get(cargoId),proxy=physics.forkliftProxies.get(a.mode.activeId);
    const array=value=>value?.asArray?.()??null,number=value=>value==null?null:Number.isFinite(value)?value:String(value);
    const nodePose=node=>node?{position:array(node.position),quaternion:array(node.rotationQuaternion),rotation:array(node.rotation)}:null;
    if(!c||!proxy)return{sampledAt:performance.now(),cargoId,available:false};
    const tines=proxy.tines.map(t=>({position:t.pose.position,orientation:t.pose.orientation,halfExtents:t.halfExtents}));
    const actual=physics.dynamicForkliftPose(a.mode.activeId),requestedDelta=proxy.dynamicActive?proxy.dynamic.forkTargetLift-proxy.lift:proxy.liftDelta;
    const externalStable=physics.elapsedSeconds-c.lastExternalSupportAt<=rules.EXTERNAL_SUPPORT_CONTACT_MEMORY_SECONDS&&physics.elapsedSeconds-c.externalSupportStartedAt>=rules.EXTERNAL_SUPPORT_SETTLE_SECONDS;
    return{sampledAt:performance.now(),physicsTime:physics.elapsedSeconds,cargoId,vehicleId:a.mode.activeId,
      vehicle:{actor:nodePose(a.mode.actorRoot),position:array(actual?.position),quaternion:array(actual?.orientation),linearVelocity:array(actual?.linearVelocity),angularVelocity:array(actual?.angularVelocity),actualLift:actual?.forkLift,modeLift:a.mode.state.lift},
      cargo:{position:array(c.node.position),quaternion:array(c.node.rotationQuaternion),dimensions:array(c.dimensions),linearVelocity:array(c.aggregate.body.getLinearVelocity()),localOwner:c.localOwner,support:c.forkSupportActive},
      supportTines:tines.map(t=>({position:array(t.position),quaternion:array(t.orientation),halfExtents:array(t.halfExtents)})),
      dynamicForkBody:nodePose(proxy.dynamic?.forkNode),
      lift:{dynamicActive:proxy.dynamicActive,proxy:proxy.lift,target:proxy.dynamic?.forkTargetLift??null,delta:proxy.liftDelta,requestedDelta},
      history:{forkSupportUntil:number(c.forkSupportUntil),forkSupportReleaseUntil:number(c.forkSupportReleaseUntil),lastContactAt:number(c.lastContactAt),lastExternalSupportAt:number(c.lastExternalSupportAt),externalSupportStartedAt:number(c.externalSupportStartedAt)},
      gates:{geometryEligible:rules.cargoSupportedByForklift({position:c.node.position,orientation:c.node.rotationQuaternion,dimensions:c.dimensions},tines),tineCollisionEnabled:rules.forkTineCollisionEnabled(proxy.lift,c.forkSupportActive),nonDescending:requestedDelta>=-1e-5,cooldownReady:physics.elapsedSeconds>=c.forkSupportReleaseUntil,externalSupportStable:externalStable,externalSupportAllowsEngage:!externalStable||requestedDelta>1e-5}
    };
  },delayMs);
  const deliveryEvidence=async(stage,crate,pickupY,cargoId)=>{
    const observed=await page.evaluate(cargoId=>{
      const r=window.storyProbe.delivery,a=r.getForklifts(),c=a.cargo.physics.entries.get(cargoId),p=a.cargo.physics.dynamicForkliftPose(a.mode.activeId);
      const fields=["id","worldId","x","y","z","qx","qy","qz","qw","velocityX","velocityY","velocityZ","angularVelocityX","angularVelocityY","angularVelocityZ","sleeping","autoRight","updatedAtMs","touching"];
      const select=value=>value?Object.fromEntries(fields.filter(key=>value[key]!==undefined).map(key=>[key,value[key]])):null;
      const trace=window.storyCargoTrace;
      return{sampledAt:performance.now(),challengeId:r.active?.prompt.id,cargoId,delivered:r.active?.prompt.delivery.delivered,
        local:{cargo:c?.node.position.asArray(),quaternion:c?.node.rotationQuaternion?.asArray(),velocity:c?.aggregate.body.getLinearVelocity().asArray(),support:c?.forkSupportActive,localOwner:c?.localOwner,physicalLift:p?.forkLift,modeLift:a.mode.state.lift},
        // This is the latest accepted cargo echo, not the server's private lifted/settled bookkeeping.
        acceptedCargo:select(a.cargo.serverStates.get(cargoId)),
        network:trace?{sent:trace.sent.filter(value=>value.id===cargoId).slice(-30).map(select),received:trace.received.filter(value=>value.id===cargoId).slice(-30).map(select)}:null};
    },cargoId);
    const evidence={schema:"new-yokosuka-forklift-delivery-evidence-v1",stage,crate,pickupY,requiredCarryY:pickupY+.35,requiredPhysicalLift:.45,...observed};
    await testInfo.attach(`${prefix}-crate-${crate}-${stage}.json`,{body:JSON.stringify(evidence,null,2),contentType:"application/json"});
    console.info("Physical delivery evidence",JSON.stringify({stage,crate,cargoId,pickupY,local:observed.local,acceptedCargo:observed.acceptedCargo,packets:observed.network?{sent:observed.network.sent.length,received:observed.network.received.length}:null}));
  };
  expect(await page.evaluate(()=>window.storyProbe.delivery.getForklifts().fleet.size)).toBe(1);
  const initialVehicle=await info(),original=initialVehicle.position,heading=initialVehicle.yaw,forward=[Math.sin(heading),Math.cos(heading)];
  console.info("Physical delivery initial alignment",prefix,JSON.stringify(initialVehicle));
  // This exercise follows a clear straight corridor. Drive through the real
  // keyboard/physics boundary, without teleporting the vehicle or cargo.
  const slowDrive=async(field,target,{realign=true,tolerance=.25}={})=>{
    const held=new Set();let last,realignments=0,deadline=Date.now()+30_000;
    const keys=async next=>{for(const key of held)if(!next.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
    try{while(Date.now()<deadline){
      last=await info();if(!last)return;const point=field==="cargo"?last.cargo:last.position,x=point?.[0];expect(x).toBeDefined();
      expect(last.position[1],`Forklift left the road: ${JSON.stringify(last)}`).toBeLessThan(2);
      const dx=target[0]-x,dz=target[1]-point[2],velocity=last.velocity[0]*Math.sin(last.yaw)+last.velocity[2]*Math.cos(last.yaw);
      // Lowering can nudge the box. Aim safely inside the drop zone rather
      // than stopping as soon as its center crosses the boundary.
      if(field==="cargo"&&x>=last.view.dropMin[0]+.45&&x<=last.view.dropMax[0]-.45&&last.cargo[2]>=last.view.dropMin[2]+.45&&last.cargo[2]<=last.view.dropMax[2]-.45&&Math.abs(velocity)<.2)return;
      if(Math.hypot(dx,dz)<tolerance&&Math.abs(velocity)<.2)return;
      // Contacts can change both yaw and lateral position. X-only throttle
      // control let repeated return trips drift over a metre from the crate.
      // Follow the pickup/drop lane in 2D, reversing steering when backing up.
      const remaining=dx*forward[0]+dz*forward[1],direction=Math.sign(remaining)||1;
      const cross=-dx*forward[1]+dz*forward[0];
      if(field==="vehicle"&&realign&&realignments<2&&Math.abs(remaining)<.3&&Math.abs(cross)>.2&&Math.abs(velocity)<.15){
        // A forklift cannot steer sideways from a stop. Back up along the lane
        // and make another approach instead of relaxing the pickup tolerance.
        await keys(new Set());realignments++;
        await slowDrive("vehicle",[last.position[0]-forward[0]*2.5,last.position[2]-forward[1]*2.5],{realign:false});
        deadline=Date.now()+30_000;continue;
      }
      const desiredYaw=heading-direction*Math.atan2(cross,3);
      const error=Math.atan2(Math.sin(desiredYaw-last.yaw),Math.cos(desiredYaw-last.yaw));
      const desired=direction*Math.min(1.1,Math.abs(remaining)*1.3),change=desired-velocity,next=new Set();
      if(change>.15)next.add("KeyW");else if(change<-.15)next.add("KeyS");
      if(error*direction>.035)next.add("KeyD");else if(error*direction<-.035)next.add("KeyA");
      await keys(next);
      await page.waitForTimeout(100);
    }throw Error(`Physical drive did not reach ${field} XZ=${JSON.stringify(target)}: ${JSON.stringify(last)}`);}
    finally{await keys(new Set());}
  };
  for(let crate=0;crate<count;crate++){
    await page.waitForFunction(()=>{const r=window.storyProbe.delivery;return r.active?.prompt.delivery.cargoId&&r.getForklifts().cargo.physics.entries.has(r.active.prompt.delivery.cargoId);});
    const pickup=await info(),pickupY=deliveryChallenges.find(definition=>definition.id===pickup.challengeId)?.delivery?.pickup?.[1];
    expect(Number.isFinite(pickupY),`Missing canonical pickup height for ${pickup.challengeId}`).toBe(true);
    let approachCargo=pickup.cargo,approachTarget=[pickup.cargo[0]-forward[0]*1.3,pickup.cargo[2]-forward[1]*1.3];
    await slowDrive("vehicle",approachTarget);
    let lifted;
    for(let attempt=0;attempt<3;attempt++){
      const preLift=await pickupDiagnostic();
      await page.keyboard.down("KeyE");
      // Sample concurrently; never await this promise while E remains held.
      const midPulsePromise=pickupDiagnostic(250).catch(error=>({diagnosticError:String(error)}));
      await page.waitForTimeout(500);await page.keyboard.up("KeyE");
      const afterPulse=await pickupDiagnostic(),midPulse=await midPulsePromise;
      await page.waitForTimeout(400);
      lifted=await info();if(lifted.support)break;
      const failedLift=await pickupDiagnostic(),name=`${prefix}-crate-${crate+1}-pickup-attempt-${attempt+1}`;
      const diagnostic={schema:"new-yokosuka-forklift-pickup-diagnostic-v1",crate:crate+1,attempt:attempt+1,approach:{originalHeading:heading,targetXZ:approachTarget,cargoAtTargetCalculation:approachCargo},preLift,midPulse,afterPulse,failedLift};
      console.info("Physical delivery pickup miss",name,JSON.stringify(diagnostic));
      await testInfo.attach(`${name}.json`,{body:JSON.stringify(diagnostic,null,2),contentType:"application/json"});
      const screenshot=await page.screenshot({path:testInfo.outputPath(`${name}.png`)});
      await testInfo.attach(`${name}.png`,{body:screenshot,contentType:"image/png"});
      if(attempt<2){
        // Lower fully and back out before reinserting the forks. Pushing at
        // the raised box edge merely shoves the crate away from the tines.
        await page.keyboard.down("KeyF");try{await page.waitForFunction(()=>window.storyProbe.delivery.getForklifts().mode.state.lift<.02,null,{timeout:5000});}finally{await page.keyboard.up("KeyF");}
        const current=await info();await slowDrive("vehicle",[current.cargo[0]-forward[0]*3,current.cargo[2]-forward[1]*3]);
        const observed=await info(),distance=1.15-attempt*.1;approachCargo=observed.cargo;approachTarget=[observed.cargo[0]-forward[0]*distance,observed.cargo[2]-forward[1]*distance];await slowDrive("vehicle",approachTarget);
      }
    }
    expect(lifted.support,JSON.stringify(lifted)).toBe(true);
    // Support can engage below the server's carry-height threshold. Raise with
    // ordinary input before transport; this does not diagnose an earlier miss.
    await page.keyboard.down("KeyE");
    try{
      const deadline=Date.now()+3000;
      while(Date.now()<deadline){
        lifted=await info();expect(lifted?.support,JSON.stringify(lifted)).toBe(true);
        if(lifted.cargo[1]>=pickupY+.35&&lifted.physicalLift>=.45)break;
        await page.waitForTimeout(100);
      }
    }finally{await page.keyboard.up("KeyE");}
    lifted=await info();
    await deliveryEvidence("carry",crate+1,pickupY,pickup.view.cargoId);
    expect(lifted?.support,JSON.stringify(lifted)).toBe(true);
    expect(lifted.cargo[1],JSON.stringify(lifted)).toBeGreaterThanOrEqual(pickupY+.35);
    expect(lifted.physicalLift,JSON.stringify(lifted)).toBeGreaterThanOrEqual(.45);
    if(crate===0){
      await page.evaluate(()=>{const r=window.storyProbe.delivery,a=r.getForklifts(),c=r.getController();a.vehicleController.cameraManuallyPositioned=true;c.cameraYaw=a.mode.actorRoot.rotation.y+Math.PI/2;c.cameraPitch=.3;c.cameraDistance=7;c.updateCamera(1);});
      await page.screenshot({path:testInfo.outputPath(`${prefix}-real-pickup.png`)});
    }
    const view=(await info()).view;
    await slowDrive("cargo",[(view.dropMin[0]+view.dropMax[0])/2,(view.dropMin[2]+view.dropMax[2])/2]);
    const atGoal=await info();expect(atGoal.cargo[0]).toBeGreaterThanOrEqual(view.dropMin[0]);expect(atGoal.cargo[0]).toBeLessThanOrEqual(view.dropMax[0]);expect(atGoal.cargo[2]).toBeGreaterThan(view.dropMin[2]);expect(atGoal.cargo[2]).toBeLessThan(view.dropMax[2]);
    await page.keyboard.down("KeyF");
    try{await page.waitForFunction(()=>window.storyProbe.delivery.getForklifts().mode.state.lift<.02,null,{timeout:5000});}finally{await page.keyboard.up("KeyF");}
    const current=await info();
    // The return point is only a staging waypoint. Pickup alignment and server
    // delivery confirmation are checked separately at their original precision.
    if(current)await slowDrive("vehicle",crate<count-1?[original[0],original[2]]:[current.position[0]-forward[0]*2,current.position[2]-forward[1]*2],{tolerance:.6});
    try{
      if(crate<count-1)await expect.poll(()=>page.evaluate(()=>window.storyProbe.delivery.active?.prompt.delivery.delivered),{timeout:15_000}).toBe(crate+1);
      else await page.waitForFunction(count=>!window.storyProbe.delivery.active||window.storyProbe.delivery.active.prompt.delivery.delivered>=count,count,{timeout:20_000});
    }catch(error){
      await deliveryEvidence("drop-not-accepted",crate+1,pickupY,pickup.view.cargoId);
      throw error;
    }
    console.log("Physical delivery finished",prefix,crate+1);
  }
}
