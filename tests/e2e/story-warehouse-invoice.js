import {captureOfficeFadePixels,verifyOfficeFades} from "./warehouse-office-fades.js";
import {expect} from "@playwright/test";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";
import {openStoryRoomDoor,useStoryInspectable} from "./story-object-input.js";

const office="s1.ms8s.warehouse-eight-office";
const officeFlag="story.s1.warehouse-eight-overheard.completed";
const windowFlag="story.s1.warehouse-eight-window.completed";
const goroFlag="story.s1.goro-guard-distraction.completed";
const notebook="notebook.s1.old-warehouse-eight";
const officeLines=["E1009BA013","E1009BB001","E1009BC001","E1009BB002","E1009BC002",
  "E1009BC003","E1009BB003","E1009BC004","E1009BA014","E1009BA017"];
const paperLines=["E1009BA019","E1009BA020","E1009BA009"];
const documentLines=["E1009BA034","E1009BA029","E1009BA030"];

async function snapshot(page,id){
  const [state,dialogue]=await Promise.all(["state","dialogue"].map(async endpoint=>{
    const response=await page.request.get("/api/characters/"+id+"/"+endpoint);
    expect(response.ok()).toBe(true);return response.json();
  }));
  const bank=Buffer.from(dialogue.state.banks["2"],"base64");
  return {character:state.character,inventory:state.inventory,nativeBanks:dialogue.state.banks,bits:Object.fromEntries([192,230,240,242]
    .map(i=>[i,(bank[i>>3]>>(i%8))&1]))};
}

function idle(page){
  return page.waitForFunction(()=>{
    const p=window.storyProbe;
    return p.ready && p.lifecycle.worldRuntime.ready && !p.lifecycle.worldRuntime.switching &&
      p.regions.controller.status==="idle"&&!p.director.activeCutscene&&!p.lifecycle.getController().movementLocked;
  },null,{timeout:90_000});
}

async function walk(page,x,z,{officeSlug=null}={}){
  await page.locator("#renderCanvas").focus();
  await page.evaluate(({x,z})=>{
    const c=window.storyProbe.lifecycle.getController(),p=c.collider.position;
    c.setFirstPerson(false);c.cameraYaw=Math.atan2(x-p.x,z-p.z)+Math.PI;
  },{x,z});
  await page.keyboard.down("KeyW");
  try{
    await page.waitForFunction(({x,z,officeSlug})=>{
      const probe=window.storyProbe,c=probe.lifecycle.getController(),p=c.collider.position;
      c.cameraYaw=Math.atan2(x-p.x,z-p.z)+Math.PI;
      return probe.sceneErrors.length || (officeSlug&&probe.regions.controller.active?.scriptIdentity?.scriptSlug===officeSlug)
        || Math.hypot(x-p.x,z-p.z)<.23;
    },{x,z,officeSlug},{timeout:40_000});
  }catch(error){
    const at=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
    throw new Error(`Warehouse walk toward [${x},${z}] stopped at [${at}]`,{cause:error});
  }finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  return page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
}

export async function approachWarehouseOffice(page){
  const slug="story-s1-warehouse-eight-overheard";
  await page.waitForFunction(slug=>{
    const p=window.storyProbe,life=p?.lifecycle;
    return p?.ready && life.worldRuntime.activeWorld.id==="ms8s" && life.worldRuntime.ready
      && !life.worldRuntime.switching && (p.regions.controller.status==="idle"
        ||p.regions.controller.active?.scriptIdentity?.scriptSlug===slug);
  },slug,{timeout:90_000});
  const active=await page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug);
  if(active!==slug){
    await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-20.55,4.275,139.0]),0,{persist:false});
    });
    await walk(page,-19.36,137.85,{officeSlug:slug});
  }
  await page.waitForFunction(id=>window.storyProbe.authoredScene.active?.scene.id===id
    ||window.storyProbe.sceneErrors.length,office,{timeout:60_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

async function readPaper(page,tag,expected,{cancel=false,position}={}){
  const allowed=Array.isArray(expected)?expected:[expected];
  await observeOriginalDialogue(page,allowed,"s1.ms8s.");
  const pick=await useStoryInspectable(page,{world:"ms8s",tag,position,reposition:Boolean(position),expectedChoice:null});
  await page.waitForFunction(()=>window.originalDialogue.lines.length||window.storyProbe.sceneErrors.length,null,{timeout:15_000});
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  if(cancel)await page.evaluate(()=>window.storyProbe.regions.controller.cancel("invoice-before-acknowledgement"));
  await idle(page);
  const observed=await page.evaluate(()=>window.stopOriginalDialogue());
  expect(observed.lines).toHaveLength(1);
  const {id,text,speaker}=observed.lines[0];
  expect(allowed).toContain(id); expect(text.length).toBeGreaterThan(0);
  return {tag,id,text,speaker,screen:[pick.x,pick.y],cancelled:cancel};
}

async function paperModels(page){
  const meshes=await page.evaluate(()=>["FUT0","FUT1"].map(tag=>{
    const life=window.storyProbe.lifecycle;
    const target=life.scene.meshes.map(m=>m.metadata?.interactiveInspectable).find(o=>o?.objectTag===tag);
    if(!target)return null;
    const root=target.root,bounds=root.getHierarchyBoundingVectors(true);
    return {tag,position:root.getAbsolutePosition().asArray(),size:bounds.max.subtract(bounds.min).asArray(),
      model:root._runtimePlacementRecord?.model??root.name,
      vertices:root.getChildMeshes().filter(m=>m.isEnabled()&&m.isVisible).reduce((n,m)=>n+m.getTotalVertices(),0)};
  }));
  for(const [i,tag] of ["FUT0","FUT1"].entries()){
    expect(meshes[i]?.tag).toBe(tag);expect(meshes[i].vertices).toBeGreaterThan(0);
    expect(meshes[i].model).toContain(i?"FUTS5D8G":"FUTS5K9G");
    const pose=i?[-27.33,5.032,139.11]:[-24.01,5.04,137.21];
    for(const [axis,value] of pose.entries())expect(meshes[i].position[axis]).toBeCloseTo(value,2);
  }
  return meshes;
}

function unchanged(before,after){
  expect(after.bits).toEqual(before.bits);expect(after.inventory).toEqual(before.inventory);
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.yen).toBe(before.character.yen);
}

async function verifyPapers(page,testInfo,character,enterStoryWorld){
  const before=await snapshot(page,character.id), models=await paperModels(page), reads=[];
  const first=[-26.75,4.275,140],second=[-25.5,4.275,138.5];
  reads.push(await readPaper(page,"FUT1",paperLines[0],{position:first}));
  reads.push(await readPaper(page,"FUT0",paperLines[1],{position:second,cancel:true}));
  reads.push(await readPaper(page,"FUT1",paperLines[0],{position:first}));
  reads.push(await readPaper(page,"FUT0",paperLines[1],{position:second}));
  await page.screenshot({path:testInfo.outputPath("original-envelopes.png")});
  reads.push(await readPaper(page,"FUT0",paperLines[1],{position:second}));
  reads.push(await readPaper(page,"FUT1",paperLines[2],{position:first}));
  reads.push(await readPaper(page,"FUT1",paperLines[2],{position:first}));
  unchanged(before,await snapshot(page,character.id));
  await page.reload();await enterStoryWorld(page,character.name);await idle(page);
  reads.push(await readPaper(page,"FUT1",paperLines[0],{position:first}));
  unchanged(before,await snapshot(page,character.id));
  const proof={characterId:character.id,models,reads,bits:before.bits};
  console.info("Original printed envelopes",JSON.stringify(proof));
  await testInfo.attach("original-invoice-envelopes",{body:JSON.stringify(proof),contentType:"application/json"});
}

async function enterThroughWindow(page,testInfo,character){
  const get=()=>snapshot(page,character.id), start=await get();
  expect(start.character.worldId).toBe("mfsy");expect(start.character.storyFlags[goroFlag]).not.toBe(true);
  const choose=async()=>{
    await walk(page,-18.5,158.75,{officeSlug:"story-s1-warehouse-eight-window"});
    await expect(page.getByRole("button",{name:"Climb through the rear window",exact:true})).toBeVisible({timeout:40_000});
  };
  await choose();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle(page);
  expect((await get()).character.storyFlags[windowFlag]).not.toBe(true);
  await walk(page,-18.5,162);await choose();
  await page.getByRole("button",{name:"Climb through the rear window",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.warehouse-eight-climb");
  await page.screenshot({path:testInfo.outputPath("rear-window-climb.png")});
  await expect.poll(async()=>(await get()).character.worldId,{timeout:90_000}).toBe("ms8s");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="ms8s");
  await idle(page);
  const entered=await get();
  expect(entered.bits[240]).toBe(1);expect(entered.bits[242]).toBe(0);
  expect(entered.character.storyFlags[windowFlag]).toBe(true);expect(entered.character.storyFlags[officeFlag]).not.toBe(true);
  return {world:entered.character.worldId,position:[entered.character.x,entered.character.y,entered.character.z],bits:entered.bits};
}

async function visitDesks(page,testInfo){
  const walked=[],reads=[];
  const to=async(x,z)=>{const at=await walk(page,x,z);walked.push(at);console.info("Desk walk",x,z,at);return at;};
  await to(-24.89,144.21);
  await openStoryRoomDoor(page,{staticDoorIndex:1});
  await to(-26.12,142.99);await to(-27.25,141.15);await to(-26.75,140);
  const models=await paperModels(page);
  reads.push(await readPaper(page,"FUT1",paperLines[0]));
  await to(-25.55,138.55);
  reads.push(await readPaper(page,"FUT0",paperLines[1]));
  await page.screenshot({path:testInfo.outputPath("printed-desk-envelope.png")});
  await to(-26.75,140);
  reads.push(await readPaper(page,"FUT1",paperLines[2]));
  await to(-27.25,141.15);await to(-26.12,142.99);
  await openStoryRoomDoor(page,{staticDoorIndex:1});
  await to(-24.89,144.21);
  for(const p of walked)expect(p[1]).toBeCloseTo(4.275,1);
  return {walked,reads,models};
}

export function checkWarehouseDirector(phases,lines){
  expect(Object.keys(phases)).toEqual(["approach","lean","staff","staff-hold","listen-out","reaction","departure"]);
  const voiced=["approach","staff","staff","staff","staff","staff","staff-hold","staff-hold","reaction","departure"];
  expect(lines.map(l=>l.stage===office?"approach":l.stage?.split(".").at(-1))).toEqual(voiced);
  const last=name=>phases[name].at(-1);
  const actor=(shot,tag)=>shot.actors.find(a=>a.tag===tag);
  for(const shots of Object.values(phases)){
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].actors.filter(a=>a.drawable).map(a=>a.tag).sort()).toEqual(["AKIR","TKSA","TMHN"]);
  }
  expect(last("approach").eye).not.toEqual(phases.approach[0].eye);
  expect(last("lean").frame).toBeGreaterThanOrEqual(112);
  expect(actor(last("lean"),"AKIR").wrist).not.toEqual(actor(phases.lean[0],"AKIR").wrist);
  expect(last("staff").frame).toBeGreaterThanOrEqual(350);
  expect(last("staff").eye).not.toEqual(phases.staff[0].eye);
  expect(phases["staff-hold"]).toHaveLength(2);
  expect(actor(last("staff-hold"),"TKSA").wrist).toEqual(actor(phases["staff-hold"][0],"TKSA").wrist);
  expect(last("listen-out").frame).toBeGreaterThanOrEqual(24);
  expect(last("reaction").eye).not.toEqual(phases.reaction[0].eye);
  const atA=actor(phases.reaction[0],"AKIR").position,atB=actor(phases.departure[0],"AKIR").position;
  expect(Math.hypot(...atA.map((v,i)=>v-atB[i]))).toBeGreaterThan(2);
}

async function verifyWindowOffice(page,testInfo,character,enterStoryWorld){
  const arrived=await enterThroughWindow(page,testInfo,character);
  const checkpoint=await snapshot(page,character.id);
  const desk=await visitDesks(page,testInfo);
  unchanged(checkpoint,await snapshot(page,character.id));
  await walk(page,-24.56,143.35);await walk(page,-20.5,139);
  await observeOriginalDialogue(page,officeLines,office);
  await walk(page,-19.36,137.85,{officeSlug:"story-s1-warehouse-eight-overheard"});
  const finishFades=await captureOfficeFadePixels(page);
  await expect.poll(async()=>(await snapshot(page,character.id)).bits[242],{timeout:150_000}).toBe(1);
  await idle(page);
  const fades=await verifyOfficeFades(testInfo,finishFades);
  const film=await page.evaluate(()=>window.stopOriginalDialogue()),final=await snapshot(page,character.id);
  expect(film.lines.map(l=>l.id)).toEqual(officeLines);
  checkWarehouseDirector(film.officePhases,film.lines);
  expect(final.character.worldId).toBe("mfsy");expect(final.character.x).toBeCloseTo(-18.5,1);
  expect(final.character.z).toBeCloseTo(153.6,1);expect(final.character.storyFlags[officeFlag]).toBe(true);
  expect(final.character.storyFlags[notebook]).toBe(true);expect(final.character.storyFlags[goroFlag]).not.toBe(true);
  expect(final.inventory).toEqual(checkpoint.inventory);expect(final.character.yen).toBe(checkpoint.character.yen);
  await page.reload();await enterStoryWorld(page,character.name);await idle(page);
  const restored=await snapshot(page,character.id);expect(restored.bits).toEqual(final.bits);
  expect(restored.character.storyFlags[officeFlag]).toBe(true);
  const proof={characterId:character.id,arrived,desk,film,fades,world:restored.character.worldId,bits:restored.bits};
  console.info("Original window route through the office",JSON.stringify(proof));
  await testInfo.attach("window-office-and-invoices",{body:JSON.stringify(proof),contentType:"application/json"});
}

async function verifyDocuments(page,testInfo,character,enterStoryWorld){
  const before=await snapshot(page,character.id);
  const models=await page.evaluate(()=>["SHO0","SHO1"].map(tag=>{
    const l=window.storyProbe.lifecycle;
    const scene=l.scene.meshes.map(m=>m.metadata?.interactiveInspectable).find(o=>o?.objectTag===tag);
    if(!scene?.root)return null;
    const root=scene.root;
    return {tag,model:root._runtimePlacementRecord?.model||root.name,position:root.getAbsolutePosition().asArray(),
      vertices:root.getChildMeshes(false).filter(m=>m.isEnabled()&&m.isVisible).reduce((n,m)=>n+m.getTotalVertices(),0)};
  }));
  for(const [i,expected] of [[0,[-24.4,5.032,137.48]],[1,[-27.96,5.032,139.79]]]){
    expect(models[i].model).toContain("SHO0G00G");
    expect(models[i].vertices).toBeGreaterThan(0);
    expected.forEach((v,j)=>expect(models[i].position[j]).toBeCloseTo(v,2));
  }
  const marks={SHO0:[-25.5,4.275,138.5],SHO1:[-26.75,4.275,140]};
  const reads=[],invoices=[];
  for(const [i,tag] of ["SHO0","SHO1","SHO1","SHO0","SHO1","SHO0"].entries()){
    const line=await readPaper(page,tag,documentLines,{position:marks[tag],cancel:i===1});
    if(reads.length)expect(line.id).not.toBe(reads.at(-1).id);
    reads.push(line);
  }
  invoices.push(await readPaper(page,"FUT1",paperLines[0],{position:marks.SHO1}));
  invoices.push(await readPaper(page,"FUT0",paperLines[1],{position:marks.SHO0}));
  const afterInvoice=await readPaper(page,"SHO1",documentLines,{position:marks.SHO1});
  invoices.push(await readPaper(page,"FUT1",paperLines[2],{position:marks.SHO1}));
  await page.screenshot({path:testInfo.outputPath("warehouse-documents.png")});
  const after=await snapshot(page,character.id);unchanged(before,after);
  expect(after.nativeBanks).toEqual(before.nativeBanks);
  await page.reload();await enterStoryWorld(page,character.name);await idle(page);
  const reload=await readPaper(page,"FUT1",paperLines[0],{position:marks.SHO1});
  const final=await snapshot(page,character.id);unchanged(before,final);
  expect(final.nativeBanks).toEqual(before.nativeBanks);
  await testInfo.attach("warehouse-office-documents",{body:JSON.stringify({
    character:character.id,models,reads,invoices,afterInvoice,reload,
    sameNativeBanks:true,sameStoryFlags:true
  }),contentType:"application/json"});
}

export async function verifyWarehouseInvoice(page,testInfo,character,enterStoryWorld,mode){
  if(mode==="documents"){await verifyDocuments(page,testInfo,character,enterStoryWorld);return;}
  if(mode==="invoice"){await verifyPapers(page,testInfo,character,enterStoryWorld);return;}
  if(mode==="office-window"){
    await verifyWindowOffice(page,testInfo,character,enterStoryWorld);return;
  }
  throw Error("Unknown invoice fixture "+mode);
}
