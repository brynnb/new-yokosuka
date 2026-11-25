import {captureOfficeFadePixels,cancelOfficeDuringFade,verifyOfficeFades} from "./warehouse-office-fades.js";
import {expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {checkWarehouseDirector} from "./story-warehouse-invoice.js";
import {observeNativeFilm, originalFilm} from "./native-film-observer.js";
import {observeStagedGoroFace,verifyStagedGoroFace} from "./staged-goro-face.js";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";

export async function verifyGoroGuard(page,testInfo,character,enterStoryWorld,mode) {
  const slug="goro-guard-distraction", flag="story.s1."+slug+".completed", scene="story-s1-"+slug;
  const refusal="story.s1.warehouse-eight-refusal.completed",windowFlag="story.s1.warehouse-eight-window.completed";
  const office="story.s1.warehouse-eight-overheard.completed";
  const intro=["E1081B001","E1081A001","E1081B002","E1081A002"];
  const officeLines=["E1009BA013","E1009BB001","E1009BC001","E1009BB002","E1009BC002","E1009BC003","E1009BB003","E1009BC004","E1009BA014","E1009BA017"];
  const path=Object.keys(JSON.parse(readFileSync("src/runtime-assets.generated.json","utf8")).assets)
    .find(path=>path.startsWith("play/assets/") && path.endsWith("/"+slug+"/manifest.json"));
  expect(path).toBeTruthy();
  const {activity,ids}=originalFilm(path.slice(0,-14),slug);
  const saved=async()=>{
    const [state,dialogue]=await Promise.all(["state","dialogue"].map(async endpoint=>{
      const response=await page.request.get("/api/characters/"+character.id+"/"+endpoint);
      expect(response.ok()).toBe(true);return response.json();
    }));
    const bytes=Buffer.from(dialogue.state.banks["2"],"base64");
    return {...state,bits:Object.fromEntries([192,230,240,242,813].map(i=>[i,(bytes[i>>3]>>(i%8))&1]))};
  };
  const place=async(point,yaw=0)=>{await page.evaluate(({point,yaw})=>{
    const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(point),yaw,{persist:false});
  },{point,yaw});await page.waitForTimeout(350);};
  const idle=()=>page.waitForFunction(()=>{
    const p=window.storyProbe;return p.regions.controller.status==="idle"&&!p.director.activeCutscene&&!p.lifecycle.getController().movementLocked;
  },null,{timeout:65_000});
  const button=page.getByRole("button",{name:"Ask Goro for help",exact:true});
  const approach=async()=>{await place([125,0,108.45]);await place([114.5,0,108.45]);};
  const walked=[];
  const walkTo=async(x,z,stopAtOffice=false)=>{
    await page.locator("#renderCanvas").focus();
    const goal={x,z,stopAtOffice};
    await page.evaluate(({x,z})=>{
      const c=window.storyProbe.lifecycle.getController(), p=c.collider.position;
      c.setFirstPerson(false);c.cameraYaw=Math.atan2(x-p.x,z-p.z)+Math.PI;
    },goal);
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(({x,z,stopAtOffice})=>{
        const c=window.storyProbe.lifecycle.getController(),p=c.collider.position;
        c.cameraYaw=Math.atan2(x-p.x,z-p.z)+Math.PI;
        return (stopAtOffice && window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug==="story-s1-warehouse-eight-office") || Math.hypot(p.x-x,p.z-z)<.32;
      },goal,{timeout:30_000});
    } finally {
      await page.keyboard.up("KeyW");
      const at=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
      walked.push({goal,at});
      console.info("Warehouse walk waypoint",JSON.stringify({goal,at}));
    }
  };
  const walkWarehouseStairs=async()=>{
    await walkTo(-12.2,143.0);
    await walkTo(-11.7,145.8);
    await walkTo(-7.67,150.69);
    expect(walked.at(-1).at[1]).toBeLessThan(.1);
    await walkTo(-13.30,156.32);
    expect(walked.at(-1).at[1]).toBeGreaterThan(4);
    await walkTo(-24.56,144.08);
    await walkTo(-24.56,143.35);
    await walkTo(-20.5,139.0);
    await walkTo(-19.36,137.85,true);
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ms8s.warehouse-eight-office"
      ||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    expect(walked.at(-1).at[1]).toBeCloseTo(4.275,1);
  };
  if(mode==="stairs"){
    await walkWarehouseStairs();
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("keyboard-staircase-check"));
    await idle();expect((await saved()).bits[242]).toBe(0);return;
  }
  let initial=await saved();
  if(mode==="cold"){
    expect(initial.character.worldId).toBe("mfsy");
    expect(initial.character.x).toBeCloseTo(-18.5,1);expect(initial.character.z).toBeCloseTo(153.6,1);
    expect([initial.bits[192],initial.bits[230],initial.bits[240],initial.bits[242]]).toEqual([1,1,1,1]);
    expect(initial.character.storyFlags[flag]).toBe(true);expect(initial.character.storyFlags[office]).toBe(true);
    expect(initial.character.storyFlags["notebook.s1.old-warehouse-eight"]).toBe(true);
    expect(initial.character.storyFlags[windowFlag]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    console.info("Cold-reopened guard save",JSON.stringify({characterId:character.id,world:initial.character.worldId,
      position:[initial.character.x,initial.character.y,initial.character.z],bits:initial.bits}));
    return;
  }
  if(mode==="day-after") {
    expect(initial.character.storyFlags[refusal]).not.toBe(true);
    await place([-6,0,128]);await place([-6,0,132]);
    await expect.poll(async()=>(await saved()).character.storyFlags[refusal],{timeout:75_000}).toBe(true);
    await idle();
    const denied=await saved();expect(denied.bits[230]).toBe(1);
    const refusedDay=Math.floor(denied.character.storyTimeMs/86400000);
    await approach();await idle();expect(await button.count()).toBe(0);
    await place([125,0,108.45]);
    await page.locator("#story-wait-button").click();
    const tomorrow="Wait until tomorrow morning";
    await page.getByRole("option",{name:tomorrow,exact:true}).click();
    await page.getByRole("button",{name:tomorrow,exact:true}).click();
    await expect.poll(async()=>Math.floor((await saved()).character.storyTimeMs/86400000)).toBe(refusedDay+1);
    await idle();
    initial=await saved();
  } else {
    expect(initial.bits[230]).toBe(1);expect(initial.bits[813]).toBe(1);
  }
  expect(initial.bits[192]).toBe(0);expect(initial.bits[240]).toBe(0);
  const startIntro=async()=>{
    await approach();await expect(button).toBeVisible({timeout:40_000});
    await observeOriginalDialogue(page,[...intro,...officeLines],"s1.");
    await observeNativeFilm(page,{scene,actors:activity.actors,watchFace:"GORO"});
    await observeStagedGoroFace(page);
    await button.click();
  };
  const begin=async()=>{
    await startIntro();
    await page.waitForFunction(()=>window.storyFilm.voices.length>=2||window.storyProbe.sceneErrors.length,null,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await approach();await expect(button).toBeVisible({timeout:40_000});
  await page.getByRole("button",{name:"Not now",exact:true}).click();await idle();
  if(mode==="native"){
    await startIntro();
    await page.waitForFunction(()=>window.stagedGoroFace.voices.E1081B001?.GORO?.voiceMoving);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("goro-intro-face-cancel"));
    await idle();
    await page.waitForFunction(()=>window.stagedGoroFace.released);
    const introCancel=await saved();
    expect(introCancel.bits).toEqual(initial.bits);
    expect(introCancel.character.storyFlags).toEqual(initial.character.storyFlags);
    await testInfo.attach("goro-prelude-cancel",{contentType:"application/json",
      body:JSON.stringify(await page.evaluate(()=>window.stagedGoroFace))});
  }
  await begin();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("goro-guard-review-cancel"));await idle();
  const cancelled=await saved();
  expect(cancelled.bits).toEqual(initial.bits);expect(cancelled.character.storyFlags).toEqual(initial.character.storyFlags);
  expect(cancelled.character.worldId).toBe("mfsy");
  await begin();
  await verifyStagedGoroFace(page,testInfo);
  await page.screenshot({path:testInfo.outputPath("goro-lures-guards.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:110_000}).toBe(true);
  const inside=await saved();
  console.info("Goro inward transfer",mode,JSON.stringify({world:inside.character.worldId,
    arrival:[inside.character.x,inside.character.y,inside.character.z],bits:inside.bits,
    played:await page.evaluate(()=>({voices:window.storyFilm.voices,actors:window.storyFilm.actors,
      intro:window.originalDialogue.lines.map(line=>line.id)}))}));
  expect(inside.character.worldId).toBe("ms8s");
  expect(inside.character.x).toBeCloseTo(-8.31,1);
  expect(inside.character.z).toBeCloseTo(135.76,1);
  expect(inside.bits[242]).toBe(0);
  expect([inside.bits[192],inside.bits[240]]).toEqual([1,1]);
  expect(inside.character.storyFlags[windowFlag]).not.toBe(true);
  await idle();
  expect(inside.character.storyFlags[office]).not.toBe(true);
  if(mode==="day-after")await walkWarehouseStairs();
  else {
    await place([-18.01,0,137.16]);
    await idle();
    expect((await saved()).character.storyFlags[office]).not.toBe(true);
  }
  const enterOffice=async()=>{
    await place([-21.5,4.275,137.16],Math.PI/2);
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ms8s.warehouse-eight-office"
        ||window.storyProbe.sceneErrors.length,null,{timeout:25_000});
    } finally {await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  let fadeCancel=null;
  if(mode!=="day-after")await enterOffice();
  if(mode==="native"){
    fadeCancel=await cancelOfficeDuringFade(page);
    await testInfo.attach("warehouse-office-fade-cancel",{body:JSON.stringify(fadeCancel),contentType:"application/json"});
    await idle();
    const abandoned=await saved();
    expect(abandoned.bits[242]).toBe(0);expect(abandoned.character.storyFlags[office]).not.toBe(true);
    expect(abandoned.character.worldId).toBe("ms8s");expect(abandoned.bits[240]).toBe(1);
    await page.evaluate(()=>{window.originalDialogue.lines=window.originalDialogue.lines.filter(line=>
      !line.id.startsWith("E1009B"));window.originalDialogue.office=[];window.originalDialogue.officePhases={};});
    await enterOffice();
  }
  expect((await saved()).character.storyFlags[office]).not.toBe(true);
  const finishFades=await captureOfficeFadePixels(page);
  await expect.poll(async()=>(await saved()).character.storyFlags[office],{timeout:110_000}).toBe(true);
  await idle();
  const observed=await page.evaluate(()=>{clearInterval(window.storyFilmTimer);const y=window.stopOriginalDialogue();return {film:window.storyFilm,spoken:y.lines,office:y.office,officePhases:y.officePhases};});
  observed.fades=await verifyOfficeFades(testInfo,finishFades);
  observed.fadeCancel=fadeCancel;
  observed.warehouseWalk=walked;
  console.info("Goro opens Warehouse No. 8",mode,JSON.stringify(observed));
  checkWarehouseDirector(observed.officePhases,observed.spoken.filter(l=>l.id.startsWith("E1009B")));
  expect(observed.office).toHaveLength(3);
  expect(observed.office[0].actors.filter(a=>a.drawable).map(a=>a.tag).sort()).toEqual(["AKIR","TKSA","TMHN"]);
  expect(observed.office.at(-1).eye).not.toEqual(observed.office[0].eye);
  expect(observed.office.at(-1).actors.map(a=>a.wrist)).not.toEqual(observed.office[0].actors.map(a=>a.wrist));
  expect(observed.film.face?.attached).toBe(true);
  expect(observed.film.face?.speaking?.mouthDelta).toBeGreaterThan(0);
  expect(observed.film.face?.speaking?.meshDelta).toBeGreaterThan(0);
  expect(observed.film.voices).toEqual(ids);expect([...observed.film.actors].sort()).toEqual([...activity.actors].sort());
  expect(observed.spoken.map(l=>l.id)).toEqual([...intro,...officeLines]);
  const after=await saved();
  expect(after.character.worldId).toBe("mfsy");expect(after.bits[242]).toBe(1);expect(after.inventory).toEqual(initial.inventory);
  expect(after.character.yen).toBe(initial.character.yen);expect(after.character.storyFlags["notebook.s1.old-warehouse-eight"]).toBe(true);
  expect(after.character.x).toBeCloseTo(-18.5,1);expect(after.character.z).toBeCloseTo(153.6,1);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
  await approach();await idle();
  expect(await button.count()).toBe(0);
  const reloaded=await saved();
  expect([reloaded.bits[192],reloaded.bits[240],reloaded.bits[242]]).toEqual([1,1,1]);
  expect(reloaded.character.storyFlags[office]).toBe(true);expect(reloaded.character.storyFlags[windowFlag]).not.toBe(true);
  expect(await page.evaluate(scene=>window.storyProbe.starts.includes(scene),scene)).toBe(false);
  await testInfo.attach(slug,{body:JSON.stringify(observed),contentType:"application/json"});
}
