import {expect} from "@playwright/test";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";

const office = "s1.ms8s.warehouse-eight-office";
const light = "s1.ms8s.warehouse-light-hint";
const voices = ["E1009BA013","E1009BB001","E1009BC001","E1009BB002","E1009BC002",
  "E1009BC003","E1009BB003","E1009BC004","E1009BA014","E1009BA017"];
const officeFlag = "story.s1.warehouse-eight-overheard.completed";
const notebook = "notebook.s1.old-warehouse-eight";

async function checkpoint(page, id) {
  const [state, dialogue] = await Promise.all(["state","dialogue"].map(async key => {
    const response = await page.request.get(`/api/characters/${id}/${key}`);
    expect(response.ok()).toBe(true);
    return response.json();
  }));
  const c = state.character, data = Buffer.from(dialogue.state.banks["2"], "base64");
  return {world:c.worldId, location:[c.x,c.y,c.z], yen:c.yen, hp:c.currentHp, inventory:state.inventory,
    bit242:(data[242>>3]>>(242%8))&1, clue:Boolean(c.storyFlags[notebook]), completed:Boolean(c.storyFlags[officeFlag])};
}

async function ready(page, world="ms8s") {
  await page.waitForFunction(world => {
    const p=window.storyProbe, w=p?.lifecycle?.worldRuntime;
    return w?.activeWorld?.id===world && w.ready && !w.switching
      && !p.lifecycle.getController().movementLocked && p.regions.controller.status==="idle";
  }, world, {timeout:90_000});
}

function timing(page) {
  return page.evaluate(() => {
    const p=window.storyProbe, c=p.regions.warehouseClock;
    return {primary:c.remainingTicks, deadline:c.deadlineTicks, position:p.lifecycle.getController().collider.position.asArray()};
  });
}

async function observeStages(page) {
  await page.evaluate(() => {
    window.endTimedStages?.();
    const p=window.storyProbe, stages=[], round=v=>v.asArray().map(x=>Math.round(x*1000)/1000);
    let raf=0;
    function sample() {
      const owner=p.authoredScene?.active, id=owner?.scene?.id;
      if(id?.startsWith("s1.ms8s.") && owner.actorsBegun) {
        const actor=owner.actors.activeActor("AKIR"), cam=p.lifecycle.scene.activeCamera;
        const now={frame:Math.floor(owner.elapsed*30), ryo:round(actor.root.getAbsolutePosition()),
          eye:round(cam.globalPosition), target:round(cam.getTarget()), alpha:Number(getComputedStyle(document.querySelector("#story-screen-fade")).opacity),
          covered:!document.querySelector("#story-screen-fade").hidden,
          drawn:actor.root.getChildMeshes(false).some(m=>m.isEnabled() && m.isVisible && m.getTotalVertices()>0)};
        let s=stages.at(-1);
        if(s?.id!==id) {s={id,slug:p.regions.controller.active?.scriptIdentity?.scriptSlug,first:now,last:now};stages.push(s);}
        s.last=now;
        if(id.endsWith(".timed-approach")) {
          if(!s.reveal && now.alpha>0 && now.alpha<1)s.reveal=now;
          if(!s.beforeCut && now.frame>=45 && now.frame<60)s.beforeCut=now;
          if(!s.afterCut && now.frame>=61)s.afterCut=now;
        }
        if(!s.uncovered && !now.covered && now.drawn && now.frame>=1)s.uncovered=now;
        const face=owner.faces?.active?.faces.get("AKIR");
        if(face){
          const sample={head:face.entry.definition.faceCode,base:face.poseBase,
            target:face.gazeTargetWorld?.map(n=>Math.round(n*1000)/1000)??null,
            angles:face.eyeAngles.map(({vertical,horizontal})=>[vertical,horizontal]),
            ticks:face.gazeTicksRemaining};
          if(!s.face)s.face={first:sample};
          s.face.last=sample;
          if(sample.target && sample.angles.some(pair=>pair.some(v=>Math.abs(v)>0)))s.face.directed=sample;
        }
        const presenter=p.regions.controller.dialogue, audio=presenter.audio;
        if(!s.voiced && presenter.active && audio && !audio.paused && audio.currentTime>0)s.voiced=now;
      }
      raf=requestAnimationFrame(sample);
    }
    sample();
    window.endTimedStages=()=>{cancelAnimationFrame(raf);return stages;};
  });
}

function shorten(page, which) {
  // Only the residual countdown changes. Native floor classification, request
  // selection, player input and server-authored presentation stay live.
  return page.evaluate(which=>{
    window.storyProbe.regions.warehouseClock[which]=1;
  },which);
}

async function pressUntilStage(page,id) {
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===id || window.storyProbe.sceneErrors.length,id,{timeout:30_000});
  } finally { await page.keyboard.up("KeyW"); }
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

async function measureClock(page) {
  const start=await timing(page);
  expect(start.primary).toBe(14_400);
  expect(start.deadline).toBeGreaterThan(28_000);
  await page.waitForFunction(n=>window.storyProbe.regions.warehouseClock.deadlineTicks<=n-18,start.deadline,{timeout:10_000});
  const idle=await timing(page);
  expect(idle.primary).toBe(start.primary);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(n=>window.storyProbe.regions.warehouseClock.remainingTicks<=n-18,start.primary,{timeout:10_000});
  } finally { await page.keyboard.up("KeyW"); }
  const active=await timing(page);
  expect(active.primary).toBeLessThanOrEqual(start.primary-18);
  expect(Math.hypot(active.position[0]-start.position[0],active.position[2]-start.position[2])).toBeGreaterThan(.05);
  return {start,idle,active};
}

async function resetVisit(page,character,enterStoryWorld) {
  await page.reload(); await enterStoryWorld(page,character.name); await ready(page);
  return measureClock(page);
}

async function waitOnOriginalClock(page) {
  const start=await timing(page), born=Date.now();
  const [x,,z]=start.position;
  // Walk between two nearby points on the same floor using a held movement
  // key. Only steer the camera; the ordinary controller owns all translation.
  await page.locator("#renderCanvas").focus();
  await page.evaluate(({x,z})=>{
    const p=window.storyProbe,c=p.lifecycle.getController(),route={turns:0,minY:c.collider.position.y,maxY:c.collider.position.y};
    c.setFirstPerson(false);let nextZ=z+1.5;
    const steer=()=>{
      if(p.regions.controller.status!=="idle")return;
      const at=c.collider.position;
      route.maxY=Math.max(route.maxY,at.y);route.minY=Math.min(route.minY,at.y);
      if(Math.hypot(x-at.x,nextZ-at.z)<.25){route.turns++;nextZ=nextZ===z?z+1.5:z;}
      c.cameraYaw=Math.atan2(x-at.x,nextZ-at.z)+Math.PI;
    };
    steer();const handle=setInterval(steer,30);
    window.finishTimedWarehouseWalk=()=>{clearInterval(handle);return route;};
  },{x,z});
  await page.keyboard.down("KeyW");
  let result;
  try {
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ms8s.warehouse-light-hint"
      || window.storyProbe.sceneErrors.length,null,{timeout:660_000});
  } finally {
    await page.keyboard.up("KeyW");
    result=await page.evaluate(()=>window.finishTimedWarehouseWalk());
  }
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  expect(result.maxY).toBeLessThanOrEqual(4);
  const atDispatch=await timing(page), elapsedSeconds=(Date.now()-born)/1000;
  expect(atDispatch.primary).toBe(-1);
  expect(elapsedSeconds).toBeGreaterThanOrEqual(start.primary/30-1);
  expect(start.deadline-atDispatch.deadline).toBeGreaterThanOrEqual(start.primary);
  return {start,atDispatch,input:"KeyW",elapsedSeconds,...result};
}

async function observe(page,ids) {
  await observeStages(page); await observeOriginalDialogue(page,ids,"s1.ms8s.");
}

async function observed(page) {
  return page.evaluate(()=>({stages:window.endTimedStages(),lines:window.stopOriginalDialogue().lines}));
}

async function cancel(page) {
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("timed-warehouse-cancel"));
  await ready(page);
}

function unchanged(before, after) {
  for(const key of ["world","yen","hp","inventory","clue","completed","bit242"])expect(after[key],key).toEqual(before[key]);
}

async function downstairs(page,testInfo,character,enterStoryWorld,full) {
  await ready(page);
  const before=await checkpoint(page,character.id), count=await measureClock(page);
  expect(before.bit242).toBe(0);
  await observe(page,["E1009BA018"]);
  await shorten(page,"remainingTicks"); await pressUntilStage(page,light);
  await page.waitForFunction(()=>window.originalDialogue.lines.length===1,null,{timeout:35_000});
  await cancel(page);
  const canceled=await observed(page);
  expect(canceled.lines.map(l=>l.id)).toEqual(["E1009BA018"]);
  unchanged(before,await checkpoint(page,character.id));
  const fresh=await resetVisit(page,character,enterStoryWorld);
  await observe(page,["E1009BA018"]);
  let natural;
  if(full)natural=await waitOnOriginalClock(page);
  else {await shorten(page,"remainingTicks");await pressUntilStage(page,light);}
  await page.waitForFunction(()=>window.originalDialogue.lines.length===1,null,{timeout:35_000});
  await testInfo.attach("original-downstairs-light-shot",{body:await page.screenshot(),contentType:"image/png"});
  await ready(page);
  const hint=await observed(page), after=await checkpoint(page,character.id), postHint=await timing(page);
  expect(hint.lines.map(l=>l.id)).toEqual(["E1009BA018"]);
  const shot=hint.stages.find(s=>s.id===light)?.voiced;
  expect(shot?.drawn).toBe(true);expect(shot.covered).toBe(false);
  expect(shot.ryo).toEqual([-14.5,0,144.5]);
  expect(shot.eye[0]).toBeCloseTo(-14.77,1);expect(shot.eye[1]).toBeCloseTo(1.35,1);expect(shot.eye[2]).toBeCloseTo(145.41,1);
  expect(postHint.position[0]).toBeCloseTo(-14.5,1);expect(postHint.position[2]).toBeCloseTo(144.5,1);
  unchanged(before,after);
  await observe(page,voices); await shorten(page,"deadlineTicks");
  await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===id,office+".timed",{timeout:20_000});
  await page.waitForFunction(()=>window.originalDialogue.lines.length===1,null,{timeout:35_000});
  await cancel(page);
  const deadline=await observed(page);
  expect(deadline.stages[0].id).toBe(office+".timed");
  expect(deadline.stages[0].slug).toBe("story-s1-warehouse-eight-office-deadline");
  unchanged(before,await checkpoint(page,character.id));
  const result={character:character.id,full,count,fresh,natural,canceled,hint,postHint,deadline,after};
  await testInfo.attach("warehouse-timer-downstairs",{body:JSON.stringify(result),contentType:"application/json"});
}

async function physicalPriority(page,testInfo,character) {
  await ready(page);
  const before=await checkpoint(page,character.id);
  await observe(page,voices);
  await page.evaluate(()=>{
    const p=window.storyProbe;
    p.lifecycle.resetPlayer(p.lifecycle.vectorFromArray([-19.704,4.275,138.203]),0,{persist:false});
    p.regions.warehouseClock.remainingTicks=-1;
    p.regions.warehouseClock.deadlineTicks=-1;
  });
  const waitForShot=id=>page.waitForFunction(id=>{
    const owner=window.storyProbe.authoredScene?.active;
    return owner?.scene.id===id && owner.actorsBegun && owner.elapsed>.1;
  },id,{timeout:30_000});
  await waitForShot(office);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("warehouse-physical-priority-probe"));
  // A physical cancellation releases the director. Both native clocks are
  // still due; the first countdown has priority on this next pass.
  await waitForShot(office+".timed");
  await cancel(page);
  const priority=await observed(page), after=await checkpoint(page,character.id);
  expect(priority.stages.map(s=>s.id)).toEqual([office,office+".timed"]);
  expect(priority.stages.map(s=>s.slug)).toEqual(["story-s1-warehouse-eight-overheard","story-s1-warehouse-eight-office-timeout"]);
  unchanged(before,after);
  await testInfo.attach("warehouse-timer-priority",{body:JSON.stringify({character:character.id,priority,after}),contentType:"application/json"});
}

async function upstairs(page,testInfo,character,enterStoryWorld) {
  await ready(page);
  const before=await checkpoint(page,character.id), count=await measureClock(page);
  await observe(page,voices); await shorten(page,"remainingTicks"); await pressUntilStage(page,office+".timed");
  await page.waitForFunction(()=>window.originalDialogue.lines.length>=1,null,{timeout:60_000});
  await testInfo.attach("timed-approach-e1009ba013",{body:await page.screenshot(),contentType:"image/png"});
  await page.waitForFunction(()=>window.originalDialogue.lines.length===10,null,{timeout:180_000});
  await ready(page,"mfsy");
  const film=await observed(page), after=await checkpoint(page,character.id);
  await testInfo.attach("warehouse-office-render-samples",{body:JSON.stringify(film),contentType:"application/json"});
  expect(film.lines.map(l=>l.id)).toEqual(voices);
  expect(film.stages.map(s=>s.id)).toEqual(["timed","timed-approach","lean","staff","staff-hold","listen-out","reaction","departure"].map(s=>office+"."+s));
  expect(film.stages[0].slug).toBe("story-s1-warehouse-eight-office-timeout");
  const hiddenShot=film.stages[0].last;
  expect(hiddenShot.ryo).toEqual([-17.69,4.275,136.69]);
  expect(hiddenShot.eye[0]).toBeCloseTo(-16.919,2);
  expect(hiddenShot.eye[1]).toBeCloseTo(5.710,2);
  expect(hiddenShot.eye[2]).toBeCloseTo(137.006,2);
  expect(hiddenShot.covered).toBe(true);expect(hiddenShot.alpha).toBe(1);
  const approach=film.stages[1];
  expect(approach.reveal?.alpha).toBeGreaterThan(0);expect(approach.reveal.alpha).toBeLessThan(1);
  expect(approach.beforeCut?.frame).toBeLessThan(60);
  expect(approach.afterCut?.frame).toBeGreaterThanOrEqual(61);
  expect(Math.hypot(...approach.afterCut.eye.map((value,i)=>value-approach.beforeCut.eye[i]))).toBeGreaterThan(.1);
  expect(approach.voiced?.covered).toBe(false);
  const faceAt=suffix=>film.stages.find(stage=>stage.id===office+"."+suffix).face;
  const directed=faceAt("lean").directed;
  expect(directed.head).toBe("YKC");expect(directed.target).toEqual([-16.63,5.6,131.87]);
  expect(directed.angles.flat().every(Number.isFinite)).toBe(true);
  expect(faceAt("reaction").last.base).toBe(12);
  expect(faceAt("departure").last.base).toBe(0);
  expect(faceAt("departure").last.target).toBeNull();
  expect(after.bit242).toBe(1); expect(after.clue).toBe(true); expect(after.completed).toBe(true);
  expect(after.location[0]).toBeCloseTo(-18.5,1);expect(after.location[2]).toBeCloseTo(153.6,1);
  expect(after.hp).toBe(before.hp);expect(after.yen).toBe(before.yen);expect(after.inventory).toEqual(before.inventory);
  await page.reload(); await enterStoryWorld(page,character.name); await ready(page,"mfsy");
  const restored=await checkpoint(page,character.id);unchanged(after,restored);
  await testInfo.attach("warehouse-timer-upstairs",{body:JSON.stringify({character:character.id,count,film,after,restored}),contentType:"application/json"});
}

export async function verifyWarehouseTimer(page,testInfo,character,enterStoryWorld,mode) {
  if(mode==="timer-downstairs")await downstairs(page,testInfo,character,enterStoryWorld,process.env.NEW_YOKOSUKA_WAREHOUSE_TIMER_FULL==="true");
  else if(mode==="timer-priority")await physicalPriority(page,testInfo,character);
  else if(mode==="timer-upstairs")await upstairs(page,testInfo,character,enterStoryWorld);
  else throw Error("Unknown warehouse timer fixture "+mode);
}
