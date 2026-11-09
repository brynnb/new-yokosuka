import {expect} from "@playwright/test";

// Preview from a seeded pending receipt before connecting the bus transaction.
// The movie, actor and object loading, audio, cancellation and save are real.
export async function verifyHarborArrivalFilm(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.harbor-arrival-film.completed",before=await saved();
  await page.evaluate(()=>{window.harborArrivalSounds=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/harbor-bus-arrival/sfx/"))this.addEventListener("playing",()=>window.harborArrivalSounds.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return play.apply(this,args);};});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const scene=async()=>{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-harbor-bus-arrival"||window.storyProbe.sceneErrors.length,null,{timeout:120_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const place=async position=>{await page.evaluate(position=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(position),0,{persist:false});},position);await page.waitForTimeout(700);};
  await place([130.5,0,140.6]);await scene();await page.waitForTimeout(4000);await page.screenshot({path:testInfo.outputPath("harbor-arrival-start.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("arrival-film-cancel"));await idle();expect((await saved()).character.storyFlags[done]).not.toBe(true);
  await place([120,0,140]);await place([130.5,0,140.6]);await scene();await page.waitForTimeout(20_000);await page.screenshot({path:testInfo.outputPath("harbor-arrival-flyover.png")});
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.attachedObjects?.active?.frame>=1470,null,{timeout:90_000});
  const hinge=()=>page.evaluate(()=>window.storyProbe.director.activeCutscene.packageRuntime.attachedObjects.objects.get("BUS_").root._mt5Nodes.find(n=>(n.renderKey??(n.flag&0xffff))===157).mesh.rotationQuaternion.y);
  console.info("Harbor door probe:",JSON.stringify({open:await hinge()}));expect(Math.abs(await hinge())).toBeGreaterThan(.2);await page.screenshot({path:testInfo.outputPath("harbor-arrival-door-open.png")});
  await page.waitForFunction(()=>window.storyProbe.director.activeCutscene?.packageRuntime.attachedObjects?.active?.frame>=1590,null,{timeout:40_000});
  expect(Math.abs(await hinge())).toBeLessThan(.08);await page.screenshot({path:testInfo.outputPath("harbor-arrival-exit.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:40_000}).toBe(true);await idle();
  expect((await page.evaluate(()=>[...window.harborArrivalSounds])).length).toBeGreaterThan(0);
  expect((await saved()).character.yen).toBe(before.character.yen);expect((await saved()).inventory).toEqual(before.inventory);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}
