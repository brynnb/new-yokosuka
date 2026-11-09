import {expect} from "@playwright/test";
import {useStoryInspectable} from "./story-object-input.js";

// The house and first allowance are seeded; every letter interaction uses
// the original model pick and the real server-authored conversation.
export async function verifyIwaoFarewellLetter(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  const flag="story.s1.iwao-farewell-letter.read";
  expect(before.character.worldId).toBe("interior");expect(before.character.storyFlags[flag]).not.toBe(true);
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const read=async()=>{
    await useStoryInspectable(page,{world:"interior",tag:"TEGA",position:[.8,0,1.1],expectedChoice:null});
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:20_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(()=>{const audio=window.storyProbe.dialogue?.audio;return audio&&!audio.paused&&audio.currentTime>0&&audio.src.includes("01LETB006");},null,{timeout:20_000});
  };
  await read();await page.screenshot({path:testInfo.outputPath("iwao-letter-first-line.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("iwao-letter-check"));await idle();
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  await read();
  for(let i=0;i<15&&!(await saved()).character.storyFlags[flag];i++){await page.waitForTimeout(350);await page.keyboard.press("Space");}
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:30_000}).toBe(true);
  await idle();const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await read();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("iwao-letter-repeat-check"));await idle();
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  await read();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("iwao-letter-reload-check"));await idle();
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
