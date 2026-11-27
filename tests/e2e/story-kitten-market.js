import {expect} from "@playwright/test";

export async function verifyKittenMarket(page, testInfo, character, residentClickPoint, enterStoryWorld) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const quantity = state => state.inventory.find(item=>item.key==="kitten_sliced_fish")?.quantity ?? 0;
  const status = () => page.evaluate(()=>window.storyProbe.regions.controller.status);
  const idle = () => expect.poll(status,{timeout:30_000}).toBe("idle");
  const ready = world => page.waitForFunction(world=>{
    const runtime=window.storyProbe?.lifecycle.worldRuntime;
    return runtime?.ready && runtime.activeWorld?.id===world;
  },world,{timeout:120_000});
  const button = name => page.getByRole("button",{name,exact:true});
  const stock = page.getByRole("button",{name:/Sliced Fish.*500/i});
  const selectStock = async () => {
    await expect(stock).toBeEnabled({timeout:20_000});
    await page.evaluate(()=>{window.previousKittenBasket=window.storyProbe.regions.controller.active?.optionIds;});
    await stock.click();
    await page.waitForFunction(()=>{
      const current=window.storyProbe.regions.controller.active?.optionIds;
      return current && current!==window.previousKittenBasket;
    });
  };
  const position = async at => {
    await page.evaluate(at=>{
      const life=window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray(at),0,{persist:false});
    },at);
    await page.waitForTimeout(650);
  };
  const fixture = await saved();
  expect(fixture.character.yen).toBe(2500);
  expect(quantity(fixture)).toBe(0);
  await ready("dcbn");
  await position([1.58,0,0.87]);
  await expect(stock).toBeVisible({timeout:25_000});
  await selectStock();
  await expect(stock).toBeVisible();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-store-cancel"));
  await idle();
  expect((await saved()).character.yen).toBe(2500);
  expect(quantity(await saved())).toBe(0);
  await page.waitForTimeout(600);
  expect(await status()).toBe("idle");
  await position([1.55,0,-0.45]);
  await position([1.58,0,0.87]);
  for(let count=1;count<=5;count++){
    await selectStock();
  }
  await button("Finish shopping").click();
  await idle();
  expect((await saved()).character.yen).toBe(0);
  expect(quantity(await saved())).toBe(5);
  await page.screenshot({path:testInfo.outputPath("kitten-market-checkout.png")});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await ready("yamanose");
  const talk = async () => {
    const point=await residentClickPoint(page,"MEGM");
    expect(point.pickedActor).toBe("MEGM");
    await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length,null,{timeout:30_000});
  };
  for(let day=1;day<=5;day++){
    if(day>1){
      const before=(await saved()).worldState.gameTimeMs;
      await page.locator("#story-wait-button").click();
      await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
      await button("Wait until tomorrow morning").click();
      await expect.poll(async()=>(await saved()).worldState.gameTimeMs).toBeGreaterThan(before);
    }
    await talk();
    if(day===3){
      await button("Check on the kitten").click({timeout:20_000});
      await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.kitten-healed.completed"],{timeout:120_000}).toBe(true);
      await idle();await talk();
    }
    await page.keyboard.press("Space");
    await button("Give her the sliced fish").click({timeout:20_000});
    await expect.poll(status).toBe("line");
    await page.waitForTimeout(250);await page.keyboard.press("Space");
    await idle();
    expect(quantity(await saved())).toBe(5-day);
  }
  await page.reload();await enterStoryWorld(page,character.name);
  await ready("yamanose");
  expect(quantity(await saved())).toBe(0);
  expect((await saved()).character.yen).toBe(0);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("kitten-market-earned.png")});
}
