import {expect} from "@playwright/test";
import {observeOriginalDialogue} from "./original-dialogue-observer.js";
import {useStoryInspectable} from "./story-object-input.js";

const lines = [
  ["SA1109A001","Can I ask you something?"],
  ["SA1109B001","What is it?"],
  ["SA1109A002","Could you translate this for me?"],
  ["SA1109B002","A scroll...and it's in Chinese..."],
  ["SA1109B003","Oh Fierce Tiger."],
  ["SA1109B004","Thou are ruler of the forest, the bravest of character."],
  ["SA1109B005","As tranquil as the most majestic of mountains."],
  ["SA1109B006","As swift as a bolt of lightning."],
  ["SA1109B007","As violent as an earthquake jolting the great earth."],
  ["SA1109B008","Show no mercy, with twin fangs strike, and rush up Moon Mountain."],
  ["SA1109B009","Striking fear in all, nary a soul challenge thee."],
  ["SA1109B010","It's a secret Poetry..."],
  ["SA1109A003","Secret?"],
  ["SA1109B011","To maintain secrecy, the technique is written in Poetry form."],
  ["SA1109B012","Only one who's received the master's verbal instruction, can"],
  ["SA1109B013","...understand its meaning."],
  ["SA1109A004","Why did my father have it?"],
  ["SA1109B014","No idea...but I'd assume if he had the scroll then..."],
  ["SA1109B015","he received instruction from the original master."],
  ["SA1109A005","My father..."],
  ["SA1109B016","I'd hold onto this..."],
  ["SA1109B017","Perhaps someday you will meet the master who wrote this."],
  ["SA1109A006","Thanks. Sorry to bother you."],
];

export async function verifyPoetryReading(page, testInfo, character, enterStoryWorld) {
  const pickupFlag = "story.s1.mysterious-scroll-pickup.completed";
  const readingFlag = "story.s1.poetry-translation.completed";
  const pickup = "Look behind the dojo plaque";
  const offer = "Ask Gui Zhang to read the mysterious scroll";
  const button = name => page.getByRole("button", {name, exact:true});
  const state = async () => {
    const [save, dialogue] = await Promise.all(["state","dialogue"].map(async endpoint => {
      const res = await page.request.get(`/api/characters/${character.id}/${endpoint}`);
      expect(res.ok()).toBe(true);
      return res.json();
    }));
    const bank = Buffer.from(dialogue.state.banks["2"] || "", "base64");
    const bit = n => ((bank[n >> 3] || 0) >> (n % 8)) & 1;
    const scrolls = save.inventory.find(item => item.key === "mysterious_scroll")?.quantity || 0;
    return {save, scrolls, found:bit(548), collected:bit(903), read:bit(547)};
  };
  const idle = () => page.waitForFunction(() => window.storyProbe.regions.controller.status === "idle",
    null,{timeout:60_000});
  const inspect = () => useStoryInspectable(page,{world:"exterior",tag:"GART",
    position:[6.8,1.06,-18.5],expectedChoice:pickup});
  const enter = async world => {
    await page.evaluate(world => window.storyProbe.lifecycle.travelToWorld(world),world);
    await page.waitForFunction(world => window.storyProbe.lifecycle.worldRuntime.activeWorld.id === world
      && window.storyProbe.lifecycle.worldRuntime.ready, world, {timeout:120_000});
  };
  const warehouse = async () => {
    await enter("ms08");
    await expect(button(offer)).toBeVisible({timeout:60_000});
  };
  const cancel = async () => {
    await page.evaluate(() => window.storyProbe.regions.controller.cancel("poem-review-cancel"));
    await idle();
  };
  const check = async (taken,read) => {
    const current=await state();
    expect([current.scrolls,current.found,current.collected,current.read]).toEqual([taken,taken,taken,read]);
    expect(Boolean(current.save.character.storyFlags[pickupFlag])).toBe(Boolean(taken));
    expect(Boolean(current.save.character.storyFlags[readingFlag])).toBe(Boolean(read));
    return current.save;
  };
  const waitLines = count => page.waitForFunction(count => window.originalDialogue?.lines.length >= count
    || window.storyProbe.sceneErrors.length,count,{timeout:130_000});
  const before=await check(0,0);
  await inspect();
  await button("Leave it").click();
  await idle();
  await check(0,0);
  await inspect();
  const pickupIds=["E1011A006","E1011A102"];
  const reveal="s1.jhd0.mysterious-scroll-reveal";
  await observeOriginalDialogue(page,pickupIds,reveal);
  await button(pickup).click();
  await waitLines(1);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await cancel();
  await check(0,0);
  await inspect();
  await observeOriginalDialogue(page,pickupIds,reveal);
  await button(pickup).click();
  await waitLines(2);
  await expect.poll(async()=>(await state()).scrolls,{timeout:60_000}).toBe(1);
  await idle();
  const discovery=await page.evaluate(()=>window.stopOriginalDialogue());
  expect(discovery.lines.map(line=>line.id)).toEqual(pickupIds);
  expect(discovery.stages[0].actors).toContain("AKIR");
  expect(discovery.stages[0].objects).toEqual(expect.arrayContaining(["GART","HAKO"]));
  expect(discovery.stages[0].lastFrame).toBeGreaterThanOrEqual(800);
  expect(discovery.props.some(p=>p.signature.includes("MKCS/AKIR/18") && p.frame>=350)).toBe(true);
  const inventory=await check(1,0);
  await warehouse();
  await button("Not now").click();
  await idle();
  await check(1,0);
  await enter("exterior");
  await warehouse();
  const ids=lines.map(row=>row[0]),stage="s1.ms08.poetry-reading";
  await observeOriginalDialogue(page,ids,stage);
  await button(offer).click();
  await waitLines(4);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await cancel();
  await check(1,0);
  await enter("exterior");
  await warehouse();
  await observeOriginalDialogue(page,ids,stage);
  await button(offer).click();
  await waitLines(5);
  await check(1,0);
  await page.screenshot({path:testInfo.outputPath("gui-zhang-reads-the-poem.png")});
  await waitLines(lines.length);
  await expect.poll(async()=>(await state()).read,{timeout:90_000}).toBe(1);
  await idle();
  const result=await page.evaluate(()=>window.stopOriginalDialogue());
  expect(result.lines.map(line=>[line.id,line.text])).toEqual(lines);
  expect(result.lines.every(line=>line.stage===stage && line.speaker)).toBe(true);
  expect(result.stages[0].actors).toEqual(expect.arrayContaining(["AKIR","KISY"]));
  expect(result.stages[0].objects).toContain("STAG");
  expect(result.stages[0].lastFrame).toBeGreaterThanOrEqual(2590);
  for (const wrist of ["MKC4/AKIR/18","MKC5/KISY/12","MKI4/KISY/12"]) {
    expect(result.props.some(p=>p.signature.includes(wrist))).toBe(true);
  }
  const after=await check(1,1);
  expect(after.character.worldId).toBe("mfsy");
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(inventory.inventory);
  for (const key of ["story.s1.stab-armor.translated","story.s1.stab-armor.learned"]) {
    expect(after.character.storyFlags[key]).toBe(before.character.storyFlags[key]);
  }
  await page.reload();
  await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready && window.storyProbe.regions.getCharacter()?.id,
    null,{timeout:120000});
  await check(1,1);
  await enter("ms08");
  await page.waitForFunction(()=>window.storyProbe.automatic?.attempted && !window.storyProbe.automatic.pending);
  expect(await button(offer).count()).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await testInfo.attach("original-poetry-reading",{body:JSON.stringify({discovery,reading:result}),contentType:"application/json"});
  console.log("Original mysterious scroll", JSON.stringify({pickupVoices:discovery.lines.length,
    readingVoices:result.lines.length,arrival:after.character.worldId,retainedScrolls:1}));
}
