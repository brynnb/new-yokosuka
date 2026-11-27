import {expect} from "@playwright/test";
import {openStoryRoomDoor, useStoryInspectable} from "./story-object-input.js";

// Only the first encounter and prior opening were seeded. All food, care and
// recovery effects are earned through the ordinary UI and server transaction.
export async function verifyKittenCare(page, testInfo, character, residentClickPoint, enterStoryWorld) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(r => r.json());
  const noErrors = async () => expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle = async () => {
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
    await noErrors();
  };
  const state = await saved();
  expect(state.character.worldId).toBe("interior");
  expect(state.character.storyFlags["story.s1.first-kitten.completed"]).toBe(true);
  const continueCare=process.env.NEW_YOKOSUKA_KITTEN_CONTINUE_CARE_E2E==="true";
  if(!continueCare)expect(state.inventory.some(i=>i.key.startsWith("kitten_"))).toBe(false);

  if(!continueCare){
  for (const entry of [
    {tag:"knib",position:[-11.3,0,-3.7],choice:"Take the dried fish",item:"kitten_dried_fish",flag:"story.s1.kitten-fish.completed"},
    {tag:"kmil",position:[-11.8,0,-0.7],choice:"Take the milk",item:"kitten_milk",flag:"story.s1.kitten-milk.completed"},
  ]) {
    if(entry.tag==="kmil") await openStoryRoomDoor(page,{tag:"DDR2",position:[-11.8,0,-0.7]});
    const click = async () => {
      await useStoryInspectable(page,{world:"interior",tag:entry.tag,position:entry.position,expectedChoice:null});
      await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
      await page.keyboard.press("Space");
      await expect(page.getByRole("button",{name:entry.choice,exact:true})).toBeVisible();
    };
    await click();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    expect((await saved()).inventory.some(i=>i.key===entry.item)).toBe(false);
    await click();await page.getByRole("button",{name:entry.choice,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-pickup-check"));await idle();
    expect((await saved()).inventory.some(i=>i.key===entry.item)).toBe(false);
    await click();await page.getByRole("button",{name:entry.choice,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
    await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
    const after=await saved();expect(after.inventory.find(i=>i.key===entry.item)?.quantity).toBe(entry.tag==="knib"?3:1);
    expect(after.character.storyFlags[entry.flag]).toBe(true);
    expect(await page.evaluate(tag=>window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.runtimeObject?.objectTag===tag)?.metadata.runtimeObject.root.isEnabled(false),entry.tag)).toBe(false);
  }
  await page.screenshot({path:testInfo.outputPath("kitten-kitchen-after-pickups.png")});
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).inventory.filter(i=>i.key.startsWith("kitten_")).length).toBe(2);
  for(const tag of ["knib","kmil"])expect(await page.evaluate(tag=>window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.runtimeObject?.objectTag===tag)?.metadata.runtimeObject.root.isEnabled(false),tag)).toBe(false);
  if(process.env.NEW_YOKOSUKA_KITTEN_KITCHEN_ONLY_E2E==="true")return;
  }
  expect((await saved()).inventory.filter(i=>i.key.startsWith("kitten_")).length).toBe(2);

  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const talk = async () => {
    const point=await residentClickPoint(page,"MEGM");expect(point.pickedActor).toBe("MEGM");await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:30_000});
    await noErrors();
  };
  const chooseFeed = async choice => {
    await talk();await page.keyboard.press("Space");
    await expect(page.getByRole("button",{name:choice,exact:true})).toBeVisible({timeout:15_000});
    await page.getByRole("button",{name:choice,exact:true}).click();
  };
  await chooseFeed("Give her the dried fish");
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-feed-check"));await idle();
  expect((await saved()).inventory.some(i=>i.key==="kitten_dried_fish")).toBe(true);
  await chooseFeed("Give her the dried fish");await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
  expect((await saved()).inventory.find(i=>i.key==="kitten_dried_fish")?.quantity).toBe(2);
  await talk();
  await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
  expect(await page.getByRole("button",{name:"Give her the milk",exact:true}).isVisible()).toBe(false);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-same-day-check"));await idle();
  expect((await saved()).inventory.some(i=>i.key==="kitten_milk")).toBe(true);
  const waitTomorrow=async()=>{
    const before=(await saved()).worldState.gameTimeMs;
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
    await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
    await expect.poll(async()=>(await saved()).worldState.gameTimeMs).toBeGreaterThan(before);
  };
  await waitTomorrow();
  await chooseFeed("Give her the milk");await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
  expect((await saved()).inventory.some(i=>i.key==="kitten_milk")).toBe(false);
  await waitTomorrow();
  await talk();await page.getByRole("button",{name:"Check on the kitten",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-recovery"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  await noErrors();await page.screenshot({path:testInfo.outputPath("kitten-recovery-earned.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-recovery-check"));await idle();
  expect((await saved()).character.storyFlags["story.s1.kitten-healed.completed"]).not.toBe(true);
  await talk();await page.getByRole("button",{name:"Check on the kitten",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-kitten-recovery"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  await noErrors();
  await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.kitten-healed.completed"],{timeout:120_000}).toBe(true);
  await idle();await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const after=await saved();expect(after.character.storyFlags["story.s1.kitten-healed.completed"]).toBe(true);
  expect(after.inventory.find(i=>i.key==="kitten_dried_fish")?.quantity).toBe(2);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await chooseFeed("Give her the dried fish");
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
  await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
  expect((await saved()).inventory.find(i=>i.key==="kitten_dried_fish")?.quantity).toBe(1);
  await talk();
  await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-post-recovery-check"));await idle();
  expect((await saved()).character.storyFlags["story.s1.kitten-healed.completed"]).toBe(true);
}
