import {expect} from "@playwright/test";
import {observeNativeFilm,originalFilm} from "./native-film-observer.js";

const routes = {
  "mark-long-zha": {
    outside:[18,0,70.8], inside:[13.1,0,70.8], notebook:"notebook.s1.long-zha",
    chapter:"story.s1.workday-four.completed",
  },
  "goro-mai-marriage": {
    outside:[40,0,58.5], inside:[36.4,0,58.5], notebook:"notebook.s1.goro-mai-marriage",
  },
};

export async function verifyHarborConversation(page,testInfo,character,enterStoryWorld,slug) {
  const route = routes[slug];
  if (!route) throw Error("Unrecognized harbor conversation");
  const flag = "story.s1."+slug+".completed", scene = "story-s1-"+slug;
  const {activity, ids}=originalFilm("play/assets/harbor/"+slug,slug);
  expect(ids.length).toBe(slug==="mark-long-zha"?7:12);
  expect(ids.every(Boolean)).toBe(true);
  const saved = async () => {
    const response=await page.request.get("/api/characters/"+character.id+"/state");
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const place = async point => {
    await page.evaluate(point=>{
      const l=window.storyProbe.lifecycle;
      l.resetPlayer(l.vectorFromArray(point),0,{persist:false});
    },point);
    await page.waitForTimeout(350);
  };
  const idle = () => page.waitForFunction(()=>{
    const p=window.storyProbe;
    return p.regions.controller.status==="idle" && !p.director.activeCutscene && !p.lifecycle.getController().movementLocked;
  });
  const observe = () => observeNativeFilm(page,{scene,actors:activity.actors});
  const begin = async () => {
    await place(route.outside);
    await observe();
    await place(route.inside);
    await page.waitForFunction(()=>window.storyFilm.voices.length>=2 || window.storyProbe.sceneErrors.length,null,{timeout:65_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const initial=await saved();
  expect(initial.character.storyFlags[flag]).not.toBe(true);
  await begin();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("harbor-conversation-cancel"));
  await idle();
  expect((await saved()).character.storyFlags).toEqual(initial.character.storyFlags);
  await begin();
  await page.screenshot({path:testInfo.outputPath(slug+"-source-actors.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:110_000}).toBe(true);
  await idle();
  const observed=await page.evaluate(()=>{clearInterval(window.storyFilmTimer);return window.storyFilm;});
  expect(observed.voices).toEqual(ids);
  expect([...observed.actors].sort()).toEqual([...activity.actors].sort());
  expect(observed.frames.at(-1)).toBeGreaterThan(activity.durationFrames-90);
  const end=await saved();
  expect(end.character.storyFlags[route.notebook]).toBe(true);
  if(route.chapter)expect(end.character.storyFlags[route.chapter]).toBe(true);
  expect(end.inventory).toEqual(initial.inventory);
  expect(end.character.yen).toBe(initial.character.yen);
  await place(route.outside);
  await page.reload(); await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id,
    null,{timeout:120_000});
  await place(route.outside);
  await place(route.inside); await page.waitForTimeout(500);await idle();
  expect(await page.evaluate(scene=>window.storyProbe.starts.includes(scene),scene)).toBe(false);
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  console.info("Rendered original harbor conversation",slug,JSON.stringify(observed));
}
