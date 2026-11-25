import {createHash} from "node:crypto";
import {expect} from "@playwright/test";
import {openStoryRoomDoor} from "./story-object-input.js";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";
import {ready,checkpoint,unchanged,shorten,pressUntilStage} from "./story-warehouse-timer.js";

const prefix="s1.ms8s.warehouse-eight-";
const motion="AKI_AKI_TATI_IWA_L";
const scenes={
  floor:{id:prefix+"empty-floor",voice:"E1009BA006",object:"MS8S.empty-floor",point:[-8.31,141]},
  door:{id:prefix+"office-door",voice:"E1009BA028",object:"MS8S.office-door",point:[-22.271,139.1945]},
  inner:{id:prefix+"inner-office",voice:"E1009BA003",object:"MS8S.inner-office",point:[-26.1152,142.9875]},
  light:{id:"s1.ms8s.warehouse-light-hint",voice:"E1009BA018"},
};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

async function observe(page,stage){
  await observeOriginalDialogue(page,[stage.voice],"s1.ms8s.");
  await page.evaluate(id=>{
    const p=window.storyProbe,l=p.lifecycle,c=l.getController();
    const camera=l.scene.activeCamera;
    const point=v=>v.asArray().map(x=>Math.round(x*1000)/1000);
    const results={camera:camera.name,cameraId:camera.uniqueId,motions:[],entry:null};
    let raf,engine,previous;
    function tick(){
      const owner=p.authoredScene?.active;
      if(owner?.scene.id===id && owner.actorsBegun){
        const actor=owner.actors.activeActor("AKIR"),cam=l.scene.activeCamera;
        if(!engine){
          engine=p.authoredScene.motionRuntime;
          previous=engine.applyNamed;
          engine.applyNamed=function(model,clip,elapsed,...args){
            const ok=previous.call(this,model,clip,elapsed,...args);
            const active=p.authoredScene?.active;
            if(ok && active?.scene.id===id && active.actors?.activeActor("AKIR")?.model===model){
              const last=results.motions.at(-1);
              if(last?.name!==clip.name)results.motions.push({name:clip.name,bank:clip.bank,loop:clip.loop,
                firstFrame:Math.floor(active.elapsed*30),lastFrame:Math.floor(active.elapsed*30)});
              else last.lastFrame=Math.floor(active.elapsed*30);
            }
            return ok;
          };
        }
        const presenter=p.regions.controller.dialogue,a=presenter.audio;
        const sample={frame:Math.floor(owner.elapsed*30),drawn:actor.root.getChildMeshes(false).some(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0),
          position:point(c.collider.position),yaw:c.getYaw?.()??c.actorRoot.rotation.y,actor:point(actor.root.getAbsolutePosition()),
          camera:cam.name,cameraId:cam.uniqueId,eye:point(cam.globalPosition),target:point(cam.getTarget()),
          fade:!document.querySelector("#story-screen-fade").hidden,voiced:Boolean(presenter.active && a && !a.paused&&a.currentTime>0)};
        if(!results.entry)results.entry=sample;
        if(!results.voiced&&sample.voiced)results.voiced=sample;
        results.last=sample;
      }
      raf=requestAnimationFrame(tick);
    }
    tick();
    window.endInspectionProbe=()=>{
      cancelAnimationFrame(raf);if(engine)engine.applyNamed=previous;
      return {...results,lines:window.stopOriginalDialogue().lines};
    };
  },stage.id);
}

// Steering changes camera yaw. The real controller owns movement and collision.
async function walk(page,point,expectScene=false){
  await page.locator("#renderCanvas").focus();
  await page.evaluate(([x,z])=>{
    const p=window.storyProbe,c=p.lifecycle.getController();
    const initial=c.collider.position.asArray(),w=window.inspectionWalk={initial,travel:0,done:false};
    c.setFirstPerson(false);
    let here=initial.slice(),lastMove=performance.now();
    const steer=()=>{
      const at=c.collider.position,now=performance.now();
      const d=Math.hypot(at.x-here[0],at.z-here[2]);
      if(d>.008){w.travel+=d;lastMove=now;here=at.asArray();}
      w.end=at.asArray();w.remaining=Math.hypot(x-at.x,z-at.z);
      w.script=p.regions.controller.status!=="idle";
      w.stalled=now-lastMove>1200;
      w.done=w.script || w.remaining<.12 || w.stalled;
      if(!w.done)c.cameraYaw=Math.atan2(x-at.x,z-at.z)+Math.PI;
      if(!w.done)w.handle=requestAnimationFrame(steer);
    };
    steer();
  },point);
  await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.inspectionWalk.done,null,{timeout:24_000});}
  finally{await page.keyboard.up("KeyW");}
  const result=await page.evaluate(()=>{
    const {handle,...w}=window.inspectionWalk;cancelAnimationFrame(handle);
    return w;
  });
  if(expectScene && !result.script)throw Error("Walk did not reach inspection: "+JSON.stringify({point,...result}));
  if(!expectScene && (result.stalled || result.script))throw Error("Walk did not reach waypoint: "+JSON.stringify({point,...result}));
  return result;
}

async function inspect(page,testInfo,stage,walkTo,stop=false){
  await page.evaluate(()=>{const c=window.storyProbe.lifecycle.getController();c.setFirstPerson(false);c.updateCamera(1);});
  await observe(page,stage);
  const route=walkTo?await walk(page,walkTo,true):null;
  if(stage===scenes.light){await shorten(page,"remainingTicks");await pressUntilStage(page,stage.id);}
  await page.waitForFunction(id=>window.originalDialogue?.lines.some(l=>l.id===id),stage.voice,{timeout:25_000});
  if(stop)await page.evaluate(()=>window.storyProbe.regions.controller.cancel("warehouse-inspection-probe"));
  else if(!testInfo.attachments.some(a=>a.name===stage.voice+"-inspection")){
    await testInfo.attach(stage.voice+"-inspection",{body:await page.screenshot(),contentType:"image/png"});
  }
  await ready(page);
  const render=await page.evaluate(()=>window.endInspectionProbe());
  await testInfo.attach(stage.voice+(stop?"-cancelled":"-render"),{body:JSON.stringify({route,render}),contentType:"application/json"});
  expect(render.lines.map(l=>[l.id,l.stage])).toEqual([[stage.voice,stage.id]]);
  expect(render.voiced.drawn).toBe(true);expect(render.voiced.fade).toBe(false);
  expect(render.motions).toEqual(expect.arrayContaining([expect.objectContaining({name:motion,bank:"free",loop:false})]));
  if(stage!==scenes.light){
    expect(render.entry.cameraId).toBe(render.cameraId);expect(render.voiced.cameraId).toBe(render.cameraId);
    expect(render.voiced.frame).toBeGreaterThanOrEqual(29);
    expect(distance(render.entry.position,render.voiced.position)).toBeLessThan(.04);
    expect(distance(render.entry.actor,render.voiced.actor)).toBeLessThan(.04);
    expect(Math.abs(render.entry.yaw-render.voiced.yaw)).toBeLessThan(.02);
    if(route)expect(distance(render.entry.position,route.end)).toBeLessThan(.20);
  }
  return {route,render};
}

async function visit(page){
  return page.evaluate(()=>{
    const p=window.storyProbe,c=p.regions.warehouseClock;
    return {inspected:[...c.completedInspections],light:c.lightingSeen,position:p.lifecycle.getController().collider.position.asArray()};
  });
}

async function reload(page,character,enterStoryWorld){
  await page.reload();await enterStoryWorld(page,character.name);await ready(page);
}

async function lower(page,testInfo,character,enterStoryWorld){
  await ready(page);
  const before=await checkpoint(page,character.id),start=await visit(page);
  const cancelled=await inspect(page,testInfo,scenes.floor,scenes.floor.point,true);
  expect((await visit(page)).inspected).toEqual([]);
  await walk(page,[-8.31,138.6]);
  const floor=await inspect(page,testInfo,scenes.floor,scenes.floor.point);
  expect((await visit(page)).inspected).toContain(scenes.floor.object);
  await walk(page,[-8.31,138.6]);
  const noRepeat=await walk(page,scenes.floor.point);
  const lightAfterFloor=await inspect(page,testInfo,scenes.light,null);
  expect((await visit(page)).light).toBe(true);
  unchanged(before,await checkpoint(page,character.id));
  await walk(page,[-14.5,138.6]);
  await reload(page,character,enterStoryWorld);
  const fresh=await visit(page);
  expect(fresh.inspected).toEqual([]);expect(fresh.light).toBe(false);
  const lightFirst=await inspect(page,testInfo,scenes.light,null);
  await walk(page,[-14.5,138.6]);
  const suppressed=await walk(page,[-14.5,141]);
  const after=await checkpoint(page,character.id),final=await visit(page);
  expect(final.light).toBe(true);expect(final.inspected).toEqual([]);
  unchanged(before,after);
  return {start,cancelled,floor,noRepeat,lightAfterFloor,fresh,lightFirst,suppressed,final,after};
}

async function upper(page,testInfo,character,enterStoryWorld){
  await ready(page);
  const before=await checkpoint(page,character.id),start=await visit(page);
  const approach=await walk(page,[-24.89,144.21]);
  await openStoryRoomDoor(page,{staticDoorIndex:1});
  const inner=await inspect(page,testInfo,scenes.inner,scenes.inner.point);
  const away=await walk(page,[-26.69,142.46]);
  const once=await walk(page,scenes.inner.point);
  await openStoryRoomDoor(page,{staticDoorIndex:1});
  await walk(page,[-24.89,144.21]);
  await walk(page,[-23.56,142]);
  await walk(page,[-21.8,140.08]);
  const panel=await page.evaluate(()=>{
    const l=window.storyProbe.lifecycle;
    const doors=l.doorInteractions.entries.map(d=>{
      const b=d.root.getHierarchyBoundingVectors(true),p=b.min.add(b.max).scale(.5);
      return {staticDoorIndex:d.root._runtimePlacementRecord?.runtime?.staticDoorIndex,model:d.model,center:p.asArray()};
    }).sort((a,b)=>Math.hypot(a.center[0]+21.81,a.center[2]-139.59)-Math.hypot(b.center[0]+21.81,b.center[2]-139.59));
    return doors[0];
  });
  console.info("Upper office physical panel",JSON.stringify(panel));
  await openStoryRoomDoor(page,panel);
  const door=await inspect(page,testInfo,scenes.door,scenes.door.point);
  const inspected=await visit(page);
  expect(inspected.inspected.sort()).toEqual([scenes.door.object,scenes.inner.object].sort());
  await walk(page,[-22.73,138.77]);
  await reload(page,character,enterStoryWorld);
  const fresh=await visit(page);
  expect(fresh.inspected).toEqual([]);
  const cancelled=await inspect(page,testInfo,scenes.door,scenes.door.point,true);
  expect((await visit(page)).inspected).toEqual([]);
  const after=await checkpoint(page,character.id);unchanged(before,after);
  return {start,approach,panel,door,away,once,inner,inspected,fresh,cancelled,after};
}

export async function verifyWarehouseInspections(page,testInfo,character,enterStoryWorld,mode){
  const scenario={"inspection-floor":lower,"inspection-upper":upper}[mode];
  if(!scenario)throw Error("Unknown warehouse inspection case "+mode);
  async function progress(){
    const [state,dialogue]=await Promise.all(["state","dialogue"].map(async endpoint=>{
      const reply=await page.request.get(`/api/characters/${character.id}/${endpoint}`);
      expect(reply.ok()).toBe(true);
      return reply.json();
    }));
    const nativeFlags=Buffer.from(dialogue.state.banks["2"],"base64");
    return {flags:state.character.storyFlags,nativeFlagBankHash:createHash("sha256").update(nativeFlags).digest("hex")};
  }
  const before=await progress();
  const observed=await scenario(page,testInfo,character,enterStoryWorld);
  const after=await progress();
  expect(after).toEqual(before);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await testInfo.attach(mode,{body:JSON.stringify({character:character.id,storyProgress:{before,after},...observed}),contentType:"application/json"});
}
