import {expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {observeNativeFilm,originalFilm} from "./native-film-observer.js";

export async function verifyYamagishiMirror(page,testInfo,character,enterStoryWorld,residentClickPoint) {
  const slug="yamagishi-mirror", flag="story.s1."+slug+".completed", scene="story-s1-"+slug;
  const path=Object.keys(JSON.parse(readFileSync("src/runtime-assets.generated.json","utf8")).assets)
    .find(path=>path.startsWith("play/assets/") && path.endsWith("/"+slug+"/manifest.json"));
  expect(path).toBeTruthy();
  const {activity,ids}=originalFilm(path.slice(0,-14),slug);
  const saved=async()=>{
    const [state,native]=await Promise.all(["state","dialogue"].map(async endpoint=>{
      const response=await page.request.get("/api/characters/"+character.id+"/"+endpoint);
      expect(response.ok()).toBe(true);
      return response.json();
    }));
    const bank=Buffer.from(native.state.banks["2"],"base64");
    return {state,done:(bank[817>>3]>>(817%8)) & 1};
  };
  const idle=()=>page.waitForFunction(()=>{
    const p=window.storyProbe;
    return p.ready && p.regions.controller.status==="idle" && !p.director.activeCutscene && !p.lifecycle.getController().movementLocked;
  });
  const offer=page.getByRole("button",{name:"Show Yamagishi the Phoenix Mirror",exact:true});
  const click=async()=>{
    await page.waitForFunction(()=>window.storyProbe?.lifecycle?.scheduledActors?.dialogueActor("YAMA"),null,{timeout:65_000});
    const point=await residentClickPoint(page,"YAMA");
    expect(point.pickedActor).toBe("YAMA");await page.mouse.click(point.x,point.y);
    await expect(offer).toBeVisible({timeout:30_000});
  };
  const grips=[{tag:"PNXM",parent:"AKIR",frame:565,control:18},{tag:"PNXM",parent:"YAMA",frame:700,control:18},
    {tag:"PNXM",parent:"AKIR",frame:2345,control:18},{tag:"PNXM",frame:2655}];
  const begin=async()=>{
    await click();
    await observeNativeFilm(page,{scene,actors:["AKIR","YAMA"],watchObjects:["PNXM","COP_"],grips});
    await offer.click();
    await page.waitForFunction(()=>window.storyFilm.voices.length>=2||window.storyProbe.sceneErrors.length,null,{timeout:70_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  const before=await saved();
  expect(before.done).toBe(0);expect(before.state.character.storyFlags[flag]).not.toBe(true);
  await click();
  await page.getByRole("button",{name:"Not now",exact:true}).click();await idle();
  expect((await saved()).state.character.storyFlags).toEqual(before.state.character.storyFlags);
  await begin();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("yamagishi-mirror-review-cancel"));await idle();
  const midway=await saved();
  expect(midway.done).toBe(0);expect(midway.state.inventory).toEqual(before.state.inventory);
  expect(midway.state.character.storyFlags).toEqual(before.state.character.storyFlags);
  await begin();
  await page.waitForFunction(()=>window.storyFilm.grips.length>=2,null,{timeout:80_000});
  await page.screenshot({path:testInfo.outputPath("yamagishi-holds-phoenix-mirror.png")});
  await expect.poll(async()=>(await saved()).done,{timeout:160_000}).toBe(1);
  await idle();
  const observed=await page.evaluate(()=>{clearInterval(window.storyFilmTimer);return window.storyFilm;});
  console.info("Yamagishi examines the mirror",JSON.stringify(observed));
  expect(observed.voices).toEqual(ids);
  expect([...observed.actors].sort()).toEqual(["AKIR","YAMA"]);
  expect([...observed.objects].sort()).toEqual(["COP_","PNXM"]);
  expect(observed.grips.length).toBe(4);
  for(const held of observed.grips.slice(0,3)){expect(held.visible).toBe(true);expect(held.distance).toBeLessThan(0.4);}
  expect(observed.grips[3].visible).toBe(false);
  const after=await saved();
  expect(after.state.inventory).toEqual(before.state.inventory);
  expect(after.state.character.storyFlags[flag]).toBe(true);
  expect(after.state.character.yen).toBe(before.state.character.yen);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id,
    null,{timeout:120_000});
  expect((await saved()).done).toBe(1);
  const point=await residentClickPoint(page,"YAMA");expect(point.pickedActor).toBe("YAMA");await page.mouse.click(point.x,point.y);
  await page.waitForTimeout(800);expect(await offer.count()).toBe(0);
  await testInfo.attach(slug,{body:JSON.stringify(observed),contentType:"application/json"});
}
