import {expect} from "@playwright/test";

// Earlier kitten recovery and Jimmy's interrogation are isolated test
// prerequisites; the normal NPC click and both original films are exercised.
export async function verifyKittenRoof(page,testInfo,character,residentClickPoint,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.kitten-roof.completed",before=await saved();
  expect(before.character.storyFlags[flag]).not.toBe(true);
  await page.evaluate(()=>{window.roofVoices=new Set();const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/kitten-roof/voice/"))this.addEventListener("playing",()=>window.roofVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return original.apply(this,args);};});
  await page.evaluate(()=>{const scene=window.storyProbe.lifecycle.scene;window.roofMouths=new Map();let frame=0;window.roofMouthObserver=scene.onAfterRenderObservable.add(()=>{if(++frame%8)return;const active=window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces?.active;for(const tag of ["MEGM","HRSK"]){const generic=active?.genericFaces.get(tag),detailed=active?.faces.get(tag),face=generic||detailed;if(!face?.voiceCue)continue;const meshes=generic?generic.speech.controller.binding.meshes.map(record=>record.mesh):detailed.entry.primaryMeshes;if(!meshes.some(mesh=>mesh.isEnabled()&&scene.isActiveMesh(mesh)))continue;const sample=window.roofMouths.get(tag)||{weights:new Set(),vertices:new Set()};sample.weights.add(generic?generic.speech.controller.weight:JSON.stringify(Array.from(detailed.mouth.current)));let sum=0;for(const mesh of meshes){const data=mesh.getVerticesData("position")||[];for(let i=0;i<data.length;i++){if(detailed&&mesh._mt5ExternalParentVertexOffsets?.[Math.floor(i/3)]<0)continue;sum+=data[i]*(i%17+1);}}sample.vertices.add(sum.toFixed(4));window.roofMouths.set(tag,sample);}});});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");await noErrors();};
  const talk=async()=>{const point=await residentClickPoint(page,"MEGM");expect(point.pickedActor).toBe("MEGM");await page.mouse.click(point.x,point.y);await page.getByRole("button",{name:"Check on the kitten",exact:true}).waitFor();};
  const start=async()=>{await talk();await page.getByRole("button",{name:"Check on the kitten",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-roof"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await noErrors();};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-roof-test"));await idle();expect((await saved()).character.storyFlags[flag]).not.toBe(true);};
  await talk();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  await start();await page.waitForTimeout(4000);await page.screenshot({path:testInfo.outputPath("kitten-roof-opening.png")});await cancel();
  await start();await page.waitForTimeout(15_000);await page.screenshot({path:testInfo.outputPath("kitten-roof-later.png")});await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-medicine"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await noErrors();
  await page.waitForTimeout(5000);await page.screenshot({path:testInfo.outputPath("kitten-nozomi-medicine.png")});await cancel();
  await start();await page.keyboard.press("KeyX");
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-medicine"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await noErrors();
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:100_000}).toBe(true);await idle();
  expect(await page.evaluate(()=>window.roofVoices.size)).toBeGreaterThan(1);
  const mouths=await page.evaluate(()=>{window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(window.roofMouthObserver);return Object.fromEntries([...window.roofMouths].map(([tag,value])=>[tag,{weights:value.weights.size,vertices:value.vertices.size}]));});
  console.info("Kitten roof rendered mouth samples",JSON.stringify(mouths));
  for(const tag of ["MEGM","HRSK"]){expect(mouths[tag]?.weights,`${tag} lip timing`).toBeGreaterThan(1);expect(mouths[tag]?.vertices,`${tag} visible mouth motion`).toBeGreaterThan(1);}
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
