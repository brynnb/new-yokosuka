import {expect} from "@playwright/test";

// Mirror progress and the date are isolated fixtures. Walking, confirmation,
// original films, cancellation, receipt and reload use the actual Story path.
export async function verifyNozomiParkTears(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.nozomi-park-tears.completed",initial=await saved(),natural=process.env.NEW_YOKOSUKA_NOZOMI_TEARS_NATURAL==="true";
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("sakuragaoka"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="sakuragaoka"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await page.evaluate(()=>{
    window.tearsVoices=new Set();const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/dnoz/voice/"))this.addEventListener("playing",()=>window.tearsVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return play.apply(this,args);};
    const scene=window.storyProbe.lifecycle.scene;window.tearsMouthVertices=new Set();let frame=0;
    window.tearsMouthObserver=scene.onAfterRenderObservable.add(()=>{if(++frame%8)return;const face=window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces?.active?.faces.get("HRSK");if(!face?.voiceCue||!face.entry.primaryMeshes.some(mesh=>mesh.isEnabled()&&scene.isActiveMesh(mesh)))return;let sum=0;for(const mesh of face.entry.primaryMeshes){const data=mesh.getVerticesData("position")||[];for(let i=0;i<data.length;i++){if(mesh._mt5ExternalParentVertexOffsets?.[Math.floor(i/3)]<0)continue;sum+=data[i]*(i%17+1);}}window.tearsMouthVertices.add(sum.toFixed(4));});
  });
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const unchanged=async()=>{const s=await saved();expect(s.character.storyFlags[done]).not.toBe(true);expect(new Date(s.character.storyTimeMs).getUTCHours()).toBe(19);expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);};
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-14,0,-8]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(500);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:25_000});}finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:90_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const enter=async()=>{await approach();await page.getByRole("button",{name:"Talk with Nozomi",exact:true}).click();await scene("story-s1-nozomi-park-tears-1");};
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  await enter();await page.waitForTimeout(3000);await page.screenshot({path:testInfo.outputPath("nozomi-tears-first-film.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("nozomi-tears-first-cancel"));await idle();await unchanged();
  await enter();await page.keyboard.press("KeyX");await scene("story-s1-nozomi-park-tears-2");await page.waitForTimeout(4000);await page.screenshot({path:testInfo.outputPath("nozomi-tears-second-film.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("nozomi-tears-second-cancel"));await idle();await unchanged();
  await enter();if(!natural)await page.keyboard.press("KeyX");await scene("story-s1-nozomi-park-tears-2");if(!natural)await page.keyboard.press("KeyX");
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:natural?180_000:60_000}).toBe(true);await idle();
  if(natural){expect(await page.evaluate(()=>window.tearsVoices.size)).toBeGreaterThan(15);expect(await page.evaluate(()=>window.tearsMouthVertices.size)).toBeGreaterThan(1);}
  await page.evaluate(()=>window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(window.tearsMouthObserver));
  const after=await saved();expect(new Date(after.character.storyTimeMs).getUTCHours()).toBe(23);expect(new Date(after.character.storyTimeMs).getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe("sakuragaoka");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});expect((await saved()).character.storyFlags[done]).toBe(true);
}
