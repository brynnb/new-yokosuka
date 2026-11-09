import {expect} from "@playwright/test";

// Only the personal date and mirror meeting are seeded; the arcade approach,
// original conversation, notebook, cancellation and reload are genuine.
export async function verifyEriNozomiPark(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.eri-nozomi-lead.completed",initial=await saved();
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("dobuita"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="dobuita"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-16,0,33]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(500);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.d000.eri-nozomi-lead"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await approach();await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});await page.screenshot({path:testInfo.outputPath("eri-original-voiced-lead.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("eri-park-lead-cancel"));await idle();expect((await saved()).character.storyFlags[done]).not.toBe(true);
  await approach();for(let i=0;i<25&&!(await saved()).character.storyFlags[done];i++){await page.keyboard.press("Space");await page.waitForTimeout(350);}
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:30_000}).toBe(true);await idle();
  const after=await saved();expect(after.character.storyFlags["notebook.s1.eri-nozomi-park"]).toBe(true);expect(after.character.storyFlags["story.s1.nozomi-park-tears.completed"]).not.toBe(true);expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[done]).toBe(true);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<130&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Eri said Nozomi seemed upset");
  await page.keyboard.press("Escape");
}
