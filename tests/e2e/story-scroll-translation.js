import {expect} from "@playwright/test";

const lines = [
  ["Mind if I ask you something?", "SA1108A001"],
  ["What is it!?", "SA1108B001"],
  ["Could you translate this for me?", "SA1108A002"],
  ["A Chinese martial arts scroll.", "SA1108B002"],
  ["The Stab Armor is a palm blow that utilizes the body's power.", "SA1108B003"],
  ["Take one step forward, and two steps back, and then tense your limbs.", "SA1108B004"],
  ["The resulting impact is capable of penetrating armor.", "SA1108B005"],
  ["Powerful enough to fell a fierce tiger in one hit.", "SA1108B006"],
  ["It's a different style from mine, so it's not clear.", "SA1108B007"],
  ["But if you remember what I read while practicing...", "SA1108B008"],
  ["perhaps you could master it.", "SA1108B009"],
  ["Really...", "SA1108A003"],
  ["I have work to do.", "SA1108B010"],
  ["Thanks, sorry to bother you.", "SA1108A004"],
];

export async function verifyScrollTranslation(page, testInfo, character, enterStoryWorld) {
  const translated = "story.s1.stab-armor.translated";
  const learned = "story.s1.stab-armor.learned";
  const completed = "story.s1.stab-armor-translation.completed";
  const state = () => page.request.get(`/api/characters/${character.id}/state`).then(response=>response.json());
  const offer = page.getByRole("button",{name:"Ask Gui Zhang to translate the scroll",exact:true});
  const reload = async () => {
    await page.reload();
    await enterStoryWorld(page,character.name);
    await page.waitForFunction(() => window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id, null, {timeout:120000});
  };
  const before = await state();
  expect(before.character.worldId).toBe("ms08");
  expect(before.inventory.filter(item=>item.key==="scroll_stab_armor")).toHaveLength(1);
  const checkPending = async () => {
    const saved = await state();
    for (const flag of [translated, learned, completed]) expect(saved.character.storyFlags[flag]).not.toBe(true);
    expect(saved.inventory).toEqual(before.inventory);
  };
  await checkPending();
  await expect(offer).toBeVisible({timeout:60000});
  await page.getByRole("button",{name:"Not now",exact:true}).click();
  await checkPending();
  await reload();
  await offer.click({timeout:60000});
  await expect(page.locator("#dialogue-source")).toHaveText(lines[0][0]);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("translation-review"));
  await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="idle");
  await checkPending();
  await reload();
  // The voiced presenter advances naturally at the end of each audio clip.
  // Observe both on-screen lines and actual playing audio without advancing it.
  await page.evaluate(async ids => {
    const manifest=window.storyProbe.regions.controller.dialogue.voiceManifest;
    const urls=new Map(await Promise.all(ids.map(async id=>[await manifest.urlFor(id),id])));
    const trace = window.scrollReadingTrace = {lines:[],voices:[]};
    const source = document.querySelector("#dialogue-source");
    const observer = new MutationObserver(() => {
      const line=source.textContent.trim().replace(/\s+/g," ");
      if (line && trace.lines.at(-1)!==line) trace.lines.push(line);
    });
    observer.observe(source,{childList:true,characterData:true,subtree:true});
    const timer=setInterval(()=>{
      const audio=window.storyProbe.regions.controller.dialogue.audio;
      if (!audio || audio.paused || audio.currentTime<=0) return;
      const voice=urls.get(audio.src);
      if (voice && trace.voices.at(-1)!==voice) trace.voices.push(voice);
    },30);
    window.stopScrollReadingTrace=()=>{clearInterval(timer);observer.disconnect();};
  },lines.map(row=>row[1]));
  await offer.click({timeout:60000});
  await page.waitForFunction(()=>window.scrollReadingTrace.voices.length>=4,null,{timeout:40000});
  await checkPending();
  await page.screenshot({path:testInfo.outputPath("gui-zhang-original-scroll-reading.png")});
  await expect.poll(async()=>(await state()).character.storyFlags[translated],{timeout:90000}).toBe(true);
  const trace=await page.evaluate(()=>{window.stopScrollReadingTrace();return window.scrollReadingTrace;});
  expect(trace.lines).toEqual(lines.map(row=>row[0]));
  expect(trace.voices).toEqual(lines.map(row=>row[1]));
  const after=await state();
  expect(after.character.storyFlags[completed]).toBe(true);
  expect(after.character.storyFlags[learned]).not.toBe(true);
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  await page.locator("#inventory-button").click();
  await page.getByRole("button",{name:/Read .*Stab Armor/i}).click();
  await expect.poll(async()=>(await state()).character.storyFlags[learned]).toBe(true);
  await page.getByRole("button",{name:"Close inventory",exact:true}).click();
  await reload();
  await page.waitForFunction(()=>window.storyProbe.automatic?.attempted && !window.storyProbe.automatic.pending);
  expect(await offer.count()).toBe(0);
  expect((await state()).character.storyFlags[learned]).toBe(true);
}
