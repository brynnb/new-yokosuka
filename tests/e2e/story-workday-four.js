import {expect} from "@playwright/test";
import {verifyWorkdayNight} from "./story-workday-two.js";
import {verifyMorningRace} from "./story-morning-race.js";
import {verifyMorningCargo} from "./story-workday-one.js";

// Continue the actual Charlie-earned character. These shared drivers use real
// sleep choices, course driving, forklift physics and original presentations.
export async function verifyFourthMorning(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.charlie-harbor.completed"]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags["story.s1.workday-four.completed"]).not.toBe(true);expect(s.character.storyFlags["story.s1.workday-four-payday.completed"]).not.toBe(true);expect(s.character.storyFlags["notebook.s1.long-zha"]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  console.info("Fourth morning stage: original Lan Di dream, cancellation/retry and saved next-day arrival");
  await verifyWorkdayNight(page,testInfo,character,{day:"three"});await check();
  if(!(await saved()).character.storyFlags["story.s1.workday-four-race.completed"]){
    console.info("Fourth morning stage: new actual three-lap race");await verifyMorningRace(page,testInfo,character,{day:"four"});await check();
  }
  if(!(await saved()).character.storyFlags["story.s1.workday-four-morning.completed"]){
    console.info("Fourth morning stage: four physical deliveries, original lunch and saved noon");await verifyMorningCargo(page,testInfo,character,{day:"four"});await check();
  }
  const final=await check();expect(final.character.worldId).toBe("mfsy");expect(final.character.storyFlags["notebook.s1.workday-four-morning"]).toBe(true);expect(final.character.storyFlags["notebook.s1.workday-four-race"]).toBe(true);expect(final.character.storyFlags["notebook.s1.workday-four-lunch"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(12);
  await page.screenshot({path:testInfo.outputPath("fourth-workday-earned-noon-reload.png")});
}
