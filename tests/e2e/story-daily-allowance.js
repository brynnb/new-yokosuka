import {expect} from "@playwright/test";

// Only the initial allowance and its paid-day receipt are seeded. The rest
// uses normal movement, the personal wait control, and server transactions.
export async function verifyDailyAllowance(page, testInfo, character, enterStoryWorld) {
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();
  expect(initial.character.worldId).toBe("interior");
  expect(initial.character.storyFlags["story.s1.first-allowance.completed"]).toBe(true);
  const walkIn=async()=>{
    await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      // Approach from the entrance side of the foyer. The bedroom wall at
      // x=-16.3 is solid; walking through it would not exercise the route.
      l.resetPlayer(l.vectorFromArray([-14.8,0,5.9]),0,{persist:false});
      c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);
    });
    await page.waitForTimeout(300);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try {await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="line"
      || window.storyProbe.lifecycle.getController().collider.position.z<5.3,null,{timeout:10_000});}
    finally {await page.keyboard.up("KeyW");}
  };
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const waitTomorrow=async()=>{
    const old=(await saved()).worldState.gameTimeMs;
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
    await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
    await expect.poll(async()=>(await saved()).worldState.gameTimeMs).toBeGreaterThan(old);
  };
  await walkIn();await page.waitForTimeout(1200);await idle();
  expect((await saved()).character.yen).toBe(initial.character.yen);
  await waitTomorrow();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:20_000}).toBe("line");
  await page.screenshot({path:testInfo.outputPath("daily-allowance-foyer.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("daily-allowance-check"));await idle();
  expect((await saved()).character.yen).toBe(initial.character.yen);
  await walkIn();await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("line");
  await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
  await expect.poll(async()=>(await saved()).character.yen).toBe(initial.character.yen+500);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await walkIn();await page.waitForTimeout(1200);await idle();
  expect((await saved()).character.yen).toBe(initial.character.yen+500);
  await waitTomorrow();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:20_000}).toBe("line");
  await page.waitForTimeout(250);await page.keyboard.press("Space");await idle();
  await expect.poll(async()=>(await saved()).character.yen).toBe(initial.character.yen+1000);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}
