import {expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import course from "../../src/data/forklift-race-course.json" with {type:"json"};
import evidence from "../../tools/evidence/ma00-forklift-race-course.json" with {type:"json"};

function originalDrivingLine(){
  const filename=process.env.NEW_YOKOSUKA_RACE_ROUTE_CSV;
  if(!filename)throw Error("NEW_YOKOSUKA_RACE_ROUTE_CSV must point to the original recorded race route");
  const data=readFileSync(filename);
  expect(createHash("sha256").update(data).digest("hex")).toBe(evidence.source.recordingSha256);
  const float=hex=>{const view=new DataView(new ArrayBuffer(4));view.setUint32(0,parseInt(hex,16));return view.getFloat32(0);};
  // FRK0 is the stationary recording player; FRK1 is an actual moving opponent.
  const samples=data.toString("utf8").trim().split("\n").slice(3).map(line=>line.split(",")).filter(row=>row[1]==="1").map(row=>[-float(row[2]),float(row[4])]);
  const route=[];let passed=0;
  for(const p of samples){
    const gate=course.checkpoints[passed%course.checkpoints.length];
    if(Math.hypot(p[0]-gate.x,p[1]-gate.z)<=gate.radius)passed++;
    if(!route.length||Math.hypot(p[0]-route.at(-1)[0],p[1]-route.at(-1)[1])>=2)route.push(p);
    if(passed>=course.checkpoints.length&&Math.hypot(p[0]-samples[0][0],p[1]-samples[0][1])<2)break;
  }
  expect(passed).toBeGreaterThanOrEqual(course.checkpoints.length);
  expect(route.length).toBeGreaterThan(100);
  return route;
}

export async function verifyMorningRaceFromEvening(page,testInfo,character,{day="one"}={}){
  expect(["one","two"]).toContain(day);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  const prerequisite=day==="one"?"story.s1.chicken-race.completed":"story.s1.workday-one.completed";
  expect(before.character.storyFlags[prerequisite]).toBe(true);
  expect(before.character.storyFlags[`story.s1.workday-${day}-race.completed`]).not.toBe(true);
  const date=new Date(before.character.storyTimeMs);
  expect(date.getUTCHours()).toBeGreaterThanOrEqual(day==="one"?19:17);
  await page.locator("#story-wait-button").click();
  await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
  await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  const morning=await saved(),next=new Date(morning.character.storyTimeMs);
  expect(next.toISOString().slice(0,10)).toBe(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString().slice(0,10));
  expect(next.getUTCHours()).toBe(8);
  expect(morning.character.yen).toBe(before.character.yen);
  expect(morning.inventory).toEqual(before.inventory);
  await verifyMorningRace(page,testInfo,character,{day});
}

export async function verifyMorningRace(page,testInfo,character,{day="one"}={}){
  expect(["one","two","three","four","five"]).toContain(day);
  const chapter=`workday-${day}`;
  const drivingLine=originalDrivingLine();
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done=`story.s1.${chapter}-race.completed`;
  const required={one:"story.s1.chicken-race.completed",two:"story.s1.workday-one.completed",three:"story.s1.workday-two.completed",four:"story.s1.workday-three.completed",five:"story.s1.workday-four.completed"}[day];
  expect(initial.character.storyFlags[required]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unwon=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]).not.toBe(true);};
  const approach=async(position,yaw)=>{
    await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id!=="ma00race")){
    await idle();
    await approach([-20,0,117],-Math.PI/2);
    await page.keyboard.press("Space");await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unwon();
    await approach([-20,0,117],-Math.PI/2);await page.keyboard.press("Space");
    await page.getByRole("button",{name:"Join the morning race",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="ma00race"&&!window.storyProbe.lifecycle.worldRuntime.switching,null,{timeout:120_000});
  }
  if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="idle"))await approach([72,0,107],Math.PI/2);
  await page.getByRole("button",{name:"Start the morning race",exact:true}).waitFor();
  const start=async()=>{
    await page.getByRole("button",{name:"Start the morning race",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
    await page.waitForFunction(()=>window.storyProbe.delivery.active?.prompt.race.countdownMs===0,null,{timeout:15_000});
  };
  await start();await page.screenshot({path:testInfo.outputPath("morning-race-original-course.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-race-cancel"));await idle();await unwon();
  await approach([72,0,107],Math.PI/2);await start();await page.locator("#renderCanvas").focus();
  if(process.env.NEW_YOKOSUKA_RACE_OBSERVER_ID){
    const observerId=Number(process.env.NEW_YOKOSUKA_RACE_OBSERVER_ID);
    expect(Number.isSafeInteger(observerId)&&observerId>0&&observerId!==character.id).toBe(true);
    // Optional isolated-DB observer: a second character's raw socket receives
    // server-broadcast accepted poses, without starting another game renderer.
    await page.evaluate(({observerId,targetId})=>new Promise((resolve,reject)=>{
      const url=new URL('/ws',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('characterId',observerId);
      const observer=window.storyRaceObserver={socket:new WebSocket(url),last:null,connected:false};
      const timeout=setTimeout(()=>reject(Error('race observer did not join')),10000);
      observer.socket.onerror=()=>reject(Error('race observer socket failed'));
      observer.socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.type==='welcome')observer.socket.send(JSON.stringify({v:8,type:'presence',worldId:'ma00race',avatarId:'ryo',x:1000,y:0,z:1000,yaw:0,movement:'idle',sequence:1}));
        if(m.type==='snapshot'){observer.connected=true;clearTimeout(timeout);resolve();}
        if(m.type==='player_state'&&m.player?.characterId===String(targetId))observer.last={at:performance.now(),...m.player};};
    }),{observerId,targetId:character.id});
  }
  const info=()=>page.evaluate(()=>{const r=window.storyProbe.delivery;if(!r.active)return null;const a=r.getForklifts(),m=a.mode,p=a.cargo.physics.dynamicForkliftPose(m.activeId),client=a.network.getClient();return{view:r.active.prompt.race,position:m.actorRoot.position.asArray(),physicsPosition:p?.position.asArray(),orientation:p?.orientation.asArray(),yaw:m.actorRoot.rotation.y,speed:m.state.speed,velocity:p?.linearVelocity.asArray(),locked:r.getController().movementLocked,connected:client?.connected,welcomed:client?.welcomed,observed:window.storyRaceObserver?.last,presence:(window.storyProbe.presencePublishes||[]).filter(x=>x.sent).slice(-3).map(x=>({at:x.at,x:x.presence.x,y:x.presence.y,z:x.presence.z,vehicleId:x.presence.vehicleId}))};});
  if(process.env.NEW_YOKOSUKA_RACE_PACKET_GAP_E2E==='true'){
    expect(process.env.NEW_YOKOSUKA_RACE_OBSERVER_ID).toBeTruthy();
    await page.waitForFunction(()=>window.storyRaceObserver?.last?.vehicleId===window.storyProbe.delivery?.active?.prompt.race.vehicleId,null,{timeout:10000});
    // Suppress just this car's presence packets to model a connection stall;
    // the ordinary driving inputs, socket, server and challenge keep running.
    await page.evaluate(()=>{const original=WebSocket.prototype.send,id=window.storyProbe.delivery.active.prompt.race.vehicleId;window.storyGapRestore=()=>{WebSocket.prototype.send=original;};window.storyGapDropped=0;WebSocket.prototype.send=function(data){if(typeof data==='string'){const m=JSON.parse(data);if(m.type==='presence'&&m.vehicleId===id){window.storyGapDropped++;return;}}return original.call(this,data);};});
    try{
      await page.keyboard.down('KeyW');await page.waitForTimeout(4000);await page.keyboard.up('KeyW');
      const during=await info();
      expect(await page.evaluate(()=>window.storyGapDropped)).toBeGreaterThan(0);
      expect(Math.hypot(during.physicsPosition[0]-during.observed.x,during.physicsPosition[2]-during.observed.z),JSON.stringify(during)).toBeGreaterThan(2);
    }finally{await page.keyboard.up('KeyW');await page.evaluate(()=>window.storyGapRestore());}
    await expect.poll(async()=>{const s=await info();return Math.hypot(s.physicsPosition[0]-s.observed.x,s.physicsPosition[2]-s.observed.z);},{timeout:10000,message:'server did not recover the delayed vehicle pose'}).toBeLessThan(1.5);
    await page.keyboard.down('KeyW');
    try{await expect.poll(async()=>(await info()).view.passed,{timeout:20000,message:'race did not count a checkpoint after recovery'}).toBeGreaterThan(0);}
    finally{await page.keyboard.up('KeyW');}
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel('test-race-packet-gap'));await idle();await unwon();
    return;
  }
  const held=new Set();
  const keys=async next=>{for(const key of held)if(!next.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
  const first=await info();
  // The recorded path wraps near the starting grid. Find each gate's closest
  // point in course order, including a wrap for the final gate. Do not drive
  // past that point until the real server has observed the current gate:
  // otherwise a small steering deviation can miss it and strand the test on
  // later waypoints even though a player can turn back and complete the race.
  const gateTargets=[];let previous=-1;
  for(const gate of course.checkpoints){
    let best=null;
    for(let i=previous+1;i<previous+1+drivingLine.length;i++){
      const p=drivingLine[i%drivingLine.length],distance=Math.hypot(p[0]-gate.x,p[1]-gate.z);
      if(!best||distance<best.distance)best={index:i,distance};
    }
    expect(best.distance).toBeLessThan(gate.radius);
    gateTargets.push(best.index);previous=best.index;
  }
  let routeIndex=drivingLine.slice(0,30).reduce((best,p,index)=>Math.hypot(p[0]-first.position[0],p[1]-first.position[2])<Math.hypot(drivingLine[best][0]-first.position[0],drivingLine[best][1]-first.position[2])?index:best,0);
  let lastPassed=-1,last,lastProgress=Date.now(),lastMoved=Date.now(),movingPoint=first.position,recoveries=0;
  try{
    const deadline=Date.now()+15*60_000;
    while(Date.now()<deadline){
      last=await info();if(!last)break;
      const {view,position,yaw,speed}=last;
      // Follow the original AI's actual driving line through the real keyboard
      // and physics boundary. Logical gate centers are not a safe road route.
      let point=drivingLine[routeIndex%drivingLine.length];
      const lastAllowed=(view.lap-1)*drivingLine.length+gateTargets[view.checkpoint];
      for(let step=0;step<4&&routeIndex<lastAllowed&&Math.hypot(position[0]-point[0],position[2]-point[1])<2.5;step++){routeIndex++;point=drivingLine[routeIndex%drivingLine.length];}
      const target=Math.atan2(point[0]-position[0],point[1]-position[2]);
      const error=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));
      const ahead=drivingLine[(routeIndex+3)%drivingLine.length],aheadYaw=Math.atan2(ahead[0]-position[0],ahead[1]-position[2]);
      const bend=Math.abs(Math.atan2(Math.sin(aheadYaw-target),Math.cos(aheadYaw-target)));
      const desired=Math.abs(error)>.5||bend>.2?2:3.3;
      if(Math.hypot(position[0]-movingPoint[0],position[2]-movingPoint[2])>.5){movingPoint=position;lastMoved=Date.now();}
      if(Date.now()-lastMoved>2_500&&!last.locked){
        // A human can back off a barrier; exercise those same controls rather
        // than resetting physics or injecting a checkpoint when a turn clips.
        if(++recoveries>8)throw Error(`Repeated blocked turns: ${JSON.stringify({...last,point,routeIndex,error})}`);
        await keys(new Set(["KeyS"]));await page.waitForTimeout(900);await keys(new Set());
        movingPoint=(await info()).position;lastMoved=Date.now();continue;
      }
      const next=new Set();
      if(speed<desired-.2)next.add("KeyW");else if(speed>desired+.4)next.add("KeyS");
      if(error>.11)next.add("KeyD");else if(error<-.11)next.add("KeyA");
      await keys(next);
      if(view.passed!==lastPassed){lastPassed=view.passed;lastProgress=Date.now();recoveries=0;console.log("Observed morning race gate",view.passed,"lap",view.lap);}
      if(Date.now()-lastProgress>40_000)throw Error(`Race stopped progressing: ${JSON.stringify({...last,point,routeIndex,error})}`);
      expect(position[1],JSON.stringify(last)).toBeLessThan(3);
      await page.waitForTimeout(100);
    }
    if(await info())throw Error(`Race did not finish: ${JSON.stringify(last)}`);
  }finally{await keys(new Set());}
  await page.getByText(day==="five"?"Finished the final morning race. Time to start the day's deliveries.":"Finished the morning race. Time to start the day's deliveries.",{exact:true}).waitFor();await unwon();await page.keyboard.press("Space");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&!window.storyProbe.lifecycle.worldRuntime.switching,null,{timeout:120_000});
  // The committed arrival is deliberately inside the next cargo trigger. A
  // real, correctly ordered briefing may own the player before the first idle
  // observation; do not call that a race failure or suppress normal dispatch.
  await page.waitForFunction(()=>["idle","line"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length);
  await noErrors();
  if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="line")){
    const {default:routes}=await import("../../tools/scripting/story-investigation.json",{with:{type:"json"}});
    const briefing=routes.routes.find(route=>route.id===`${chapter}-morning`).authoredText.briefing;
    await page.getByText(briefing,{exact:true}).waitFor();
  }else await idle();
  const final=await saved();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags[`notebook.s1.${chapter}-race`]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);expect(final.character.worldId).toBe("mfsy");
  await page.screenshot({path:testInfo.outputPath("morning-race-earned-harbor-return.png")});
}

export async function verifyMorningRaceSaved(page,testInfo,character,{day="one"}={}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  expect(before.character.storyFlags[`story.s1.workday-${day}-race.completed`]).toBe(true);
  expect(before.character.storyFlags[`notebook.s1.workday-${day}-race`]).toBe(true);
  expect(before.character.storyFlags[`story.s1.workday-${day}-morning.completed`]).not.toBe(true);
  expect(before.character.worldId).toBe("mfsy");
  const {default:routes}=await import("../../tools/scripting/story-investigation.json",{with:{type:"json"}});
  const briefing=routes.routes.find(route=>route.id===`workday-${day}-morning`).authoredText.briefing;
  const declineNext=async()=>{
    await page.getByText(briefing,{exact:true}).waitFor({timeout:15000});
    await page.keyboard.press("Space");
    await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  };
  await declineNext();
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").filter({hasText:character.name}).click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  await declineNext();
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe("mfsy");
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.getByRole("button",{name:"Join the morning race",exact:true}).isVisible()).toBe(false);
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("morning-race-reloaded-harbor-checkpoint.png")});
}
