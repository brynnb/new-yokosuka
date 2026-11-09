import {expect} from "@playwright/test";

// Uses an isolated seeded character, but the actual region, presentation,
// input, settlement and reload are exercised through the game.
export async function verifyYamanoseFootball(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.football.completed",result=process.env.NEW_YOKOSUKA_FOOTBALL_RESULT||"caught";
  if(!["caught","missed"].includes(result))throw Error("Invalid football outcome");
  const initial=await saved();
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([36,1.916,50]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(500);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ju00.football-intro"||window.storyProbe.sceneErrors.length,null,{timeout:40_000});}finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await approach();
  await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
  const beforeCancel=await page.evaluate(()=>window.storyProbe.authoredScene.active.snapshot.position);
  await page.screenshot({path:testInfo.outputPath("football-introduction.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("football-test-cancel"));await idle();
  const restored=await page.evaluate(()=>window.storyProbe.lifecycle.capturePlayerReturnState().position);
  expect(Math.hypot(...restored.map((value,i)=>value-beforeCancel[i]))).toBeLessThan(.25);
  expect((await saved()).character.storyFlags[done]).not.toBe(true);
  const playOutcome=async()=>{
    await approach();
    for(let i=0;i<8&&!await page.evaluate(()=>!!window.storyProbe.regions.controller.active?.challengePrompt);i++){await page.keyboard.press("Space");await page.waitForTimeout(500);}
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.ju00.football"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.screenshot({path:testInfo.outputPath("football-prompt.png")});
    if(result==="caught")await page.locator('[data-challenge-button="A"]').click();
    await page.waitForFunction(result=>window.storyProbe.authoredScene?.active?.scene.id===`s1.ju00.football-${result==="caught"?"catch":"miss"}`||window.storyProbe.sceneErrors.length,result,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`football-${result}.png`)});
  };
  await playOutcome();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("football-outcome-cancel"));await idle();
  let flags=(await saved()).character.storyFlags;expect(flags[done]).not.toBe(true);expect(flags[`story.s1.football.${result}`]).not.toBe(true);
  await playOutcome();
  for(let i=0;i<20&&!(await saved()).character.storyFlags[done];i++){await page.keyboard.press("Space");await page.waitForTimeout(350);}
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:30_000}).toBe(true);await idle();
  const after=await saved();expect(after.character.storyFlags[`story.s1.football.${result}`]).toBe(true);expect(after.character.storyFlags[`story.s1.football.${result==="caught"?"missed":"caught"}`]).not.toBe(true);
  expect(after.character.yen).toBe(initial.character.yen);expect(after.inventory).toEqual(initial.inventory);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[`story.s1.football.${result}`]).toBe(true);
}
