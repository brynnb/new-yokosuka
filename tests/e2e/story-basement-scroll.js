import {expect} from "@playwright/test";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";
import {useStoryInspectable} from "./story-object-input.js";

export async function verifyBasementScroll(page, testInfo, character) {
  const ids=["E1012A299","E1012A300"];
  const texts=["The Stab Armor?","It looks like the name of a move."];
  const pick=()=>useStoryInspectable(page,{world:"ydb1",tag:"BOOK",position:[-2.8,0,6.45],expectedChoice:null});
  const choice=name=>page.getByRole("button",{name,exact:true});
  const done=()=>page.waitForFunction(()=>window.storyProbe.regions.controller.status==="idle");
  const saved=async()=>{
    const [save,dialogue]=await Promise.all(["state","dialogue"].map(async endpoint=>{
      const response=await page.request.get(`/api/characters/${character.id}/${endpoint}`);
      expect(response.ok()).toBe(true);return response.json();
    }));
    const bank=Buffer.from(dialogue.state.banks["2"] || "","base64");
    return {flag:!!save.character.storyFlags["story.s1.stab-armor-scroll.completed"],
      count:save.inventory.find(item=>item.key==="scroll_stab_armor")?.quantity || 0,
      native:((bank[969>>3] || 0)>>(969%8))&1};
  };
  const visible=()=>page.evaluate(()=>{
    const target=window.storyProbe.lifecycle.scene.meshes.map(m=>m.metadata?.runtimeObject).find(obj=>obj?.objectTag==="BOOK");
    return target?.root.isEnabled(false);
  });
  const pending={flag:false,count:0,native:0},acquired={flag:true,count:1,native:1};
  expect(await saved()).toEqual(pending);
  await pick();
  await choice("Leave it").click();
  await done();
  expect(await saved()).toEqual(pending);
  expect(await visible()).toBe(true);
  await observeOriginalDialogue(page,ids,"s1.ydb1.stab-armor-inspect");
  await pick();
  await page.waitForFunction(()=>window.originalDialogue.lines.length>0);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("basement-scroll-cancel"));
  await done();
  expect(await saved()).toEqual(pending);
  expect(await visible()).toBe(true);
  await observeOriginalDialogue(page,ids,"s1.ydb1.stab-armor-inspect");
  await pick();
  await page.waitForFunction(()=>window.originalDialogue.lines.length===2);
  expect(await saved()).toEqual(pending);
  await page.screenshot({path:testInfo.outputPath("original-basement-stab-armor.png")});
  await choice("Take the scroll").click();
  await expect.poll(saved).toEqual(acquired);
  await done();
  await expect.poll(visible).toBe(false);
  const result=await page.evaluate(()=>window.stopOriginalDialogue());
  expect(result.lines.map(line=>[line.id,line.text])).toEqual(ids.map((id,i)=>[id,texts[i]]));
  await testInfo.attach("original-basement-scroll",{body:JSON.stringify(result),contentType:"application/json"});
  console.log("Original basement scroll",JSON.stringify({tag:"BOOK",voices:ids,native969:1}));
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("ms08"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="ms08"
    && window.storyProbe.lifecycle.worldRuntime.ready);
  await expect.poll(async()=>{
    const response=await page.request.get(`/api/characters/${character.id}/state`);
    return (await response.json()).character.worldId;
  }).toBe("ms08");
}
