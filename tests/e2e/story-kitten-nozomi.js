import {expect} from "@playwright/test";
import {clickStoryKitten} from "./story-kitten-input.js";

// Earlier Story progress is a fixture; trigger, film and settlement are real.
export async function verifyKittenNozomi(page,testInfo,character,residentClickPoint,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.kitten-nozomi.completed",before=await saved();
  expect(before.character.storyFlags[flag]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await page.evaluate(()=>{window.kittenNozomiVoices=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/kitten-nozomi/voice/"))this.addEventListener("playing",()=>window.kittenNozomiVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return play.apply(this,args);};});
  await page.evaluate(()=>{const scene=window.storyProbe.lifecycle.scene;window.nozomiMouthVertices=new Set();let frame=0;window.nozomiMouthObserver=scene.onAfterRenderObservable.add(()=>{if(++frame%8)return;const face=window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces?.active?.faces.get("HRSK");if(!face?.voiceCue||!face.entry.primaryMeshes.some(m=>m.isEnabled()&&scene.isActiveMesh(m)))return;let sum=0;for(const mesh of face.entry.primaryMeshes){const data=mesh.getVerticesData("position")||[];for(let i=0;i<data.length;i++){if(mesh._mt5ExternalParentVertexOffsets?.[Math.floor(i/3)]<0)continue;sum+=data[i]*(i%17+1);}}window.nozomiMouthVertices.add(sum.toFixed(4));});});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const talk=async()=>{await clickStoryKitten(page,[35.8,2.6,40.8]);await page.getByRole("button",{name:"Spend time with the kitten",exact:true}).waitFor({timeout:30_000});};
  const start=async()=>{await talk();await page.getByRole("button",{name:"Spend time with the kitten",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-nozomi"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  await talk();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  await start();await page.waitForTimeout(2500);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-nozomi-test"));await idle();expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  await start();await page.waitForFunction(()=>window.kittenNozomiVoices.size>0,null,{timeout:30_000});await page.screenshot({path:testInfo.outputPath("kitten-nozomi-opening.png")});
  await page.waitForFunction(()=>window.storyMusic?.director.current?.trackId==="bgm018"&&!window.storyMusic.director.current.audio.paused,null,{timeout:20_000});
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>650,null,{timeout:70_000});await page.screenshot({path:testInfo.outputPath("kitten-nozomi-arrival.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:80_000}).toBe(true);await idle();
  expect(await page.evaluate(()=>window.kittenNozomiVoices.size)).toBeGreaterThan(5);
  expect(await page.evaluate(()=>{window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(window.nozomiMouthObserver);return window.nozomiMouthVertices.size;})).toBeGreaterThan(1);
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
