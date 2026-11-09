import {expect} from "@playwright/test";

// The Chen phone lead is seeded; the real approach, call, original films and
// atomic clock/progress settlement use a disposable personal Story character.
export async function verifyNozomiParkConfession(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.nozomi-park-confession.completed",initial=await saved();
  const natural=process.env.NEW_YOKOSUKA_NOZOMI_PARK_NATURAL==="true";
  await page.evaluate(()=>{
    window.parkVoices=new Set();const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/nozomi-park-call/voice/")||this.src.includes("/dnoz-ski/voice/"))this.addEventListener("playing",()=>window.parkVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return play.apply(this,args);};
    const scene=window.storyProbe.lifecycle.scene;window.parkMouthVertices=new Set();let frame=0;
    window.parkMouthObserver=scene.onAfterRenderObservable.add(()=>{if(++frame%8)return;const face=window.storyProbe.director.activeCutscene?.packageRuntime.presentation.faces?.active?.faces.get("HRSK");if(!face?.voiceCue||!face.entry.primaryMeshes.some(mesh=>mesh.isEnabled()&&scene.isActiveMesh(mesh)))return;let sum=0;for(const mesh of face.entry.primaryMeshes){const data=mesh.getVerticesData("position")||[];for(let i=0;i<data.length;i++){if(mesh._mt5ExternalParentVertexOffsets?.[Math.floor(i/3)]<0)continue;sum+=data[i]*(i%17+1);}}window.parkMouthVertices.add(sum.toFixed(4));});
  });
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const noProgress=async()=>{const x=await saved();expect(x.character.storyFlags[done]).not.toBe(true);expect(new Date(x.character.storyTimeMs).getUTCHours()).toBe(19);expect(x.character.yen).toBe(initial.character.yen);expect(x.inventory).toEqual(initial.inventory);};
  await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-14.8,0,5.9]),0,{persist:false});});
  await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();await idle();
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-14.8,0,5.9]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(400);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:60_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await noProgress();
  await approach();await page.getByRole("button",{name:"Answer the phone",exact:true}).click();await scene("story-s1-nozomi-park-call");
  await page.waitForTimeout(2500);await page.screenshot({path:testInfo.outputPath("nozomi-original-call.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("park-call-cancel"));await idle();await noProgress();
  await approach();await page.getByRole("button",{name:"Answer the phone",exact:true}).click();await scene("story-s1-nozomi-park-call");await page.keyboard.press("KeyX");
  await scene("story-s1-nozomi-park-confession-1");await page.waitForTimeout(4500);await page.screenshot({path:testInfo.outputPath("nozomi-park-first-film.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("park-film-cancel"));await idle();await noProgress();
  await approach();await page.getByRole("button",{name:"Answer the phone",exact:true}).click();await scene("story-s1-nozomi-park-call");if(!natural)await page.keyboard.press("KeyX");
  await scene("story-s1-nozomi-park-confession-1");if(!natural)await page.keyboard.press("KeyX");await scene("story-s1-nozomi-park-confession-2");
  await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("nozomi-park-second-film.png")});if(!natural)await page.keyboard.press("KeyX");
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:natural?180_000:60_000}).toBe(true);await idle();
  if(natural){expect(await page.evaluate(()=>window.parkVoices.size)).toBeGreaterThan(20);expect(await page.evaluate(()=>window.parkMouthVertices.size)).toBeGreaterThan(1);}
  await page.evaluate(()=>window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(window.parkMouthObserver));
  const after=await saved();expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
  expect(new Date(after.character.storyTimeMs).getUTCHours()).toBe(23);expect(new Date(after.character.storyTimeMs).getUTCMinutes()).toBeGreaterThanOrEqual(30);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe("interior");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[done]).toBe(true);
}
