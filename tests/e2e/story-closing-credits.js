import {expect} from "@playwright/test";

export async function verifyClosingCredits(page, testInfo, character, enterStoryWorld, mode) {
  const flag = "story.s1.closing-credits.completed";
  const dialog = page.getByRole("dialog", {name:"Closing credits"});
  const canvas = dialog.locator('canvas[aria-label="Shenmue closing credits"]');
  const read = async () => {
    const response = await page.request.get(`/api/characters/${character.id}/state`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const before = await read();
  expect(before.character.worldId).toBe("s1-voyage");
  expect(before.character.storyFlags["story.s1.departure.completed"]).toBe(true);
  expect(before.character.storyFlags[flag]).not.toBe(true);
  await expect(dialog).toBeVisible({timeout:90_000});
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(true);
  const skip = dialog.getByRole("button", {name:"Skip credits"});
  await expect(skip).toBeVisible();
  if (mode === "skip") {
    // Escape is a cancellation. The same saved deck arrival must remain
    // eligible when the player reloads, until an actual skip is confirmed.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "idle"
      && !window.storyProbe.lifecycle.getController().movementLocked);
    expect((await read()).character.storyFlags[flag]).not.toBe(true);
    await page.reload();
    await enterStoryWorld(page, character.name);
    await expect(dialog).toBeVisible({timeout:90_000});
    await expect.poll(() => page.evaluate(() => {
      const track = window.storyMusic?.director.current, audio = track?.audio;
      return track?.trackId === "closing-credits-rim004" && !audio.paused && audio.currentTime > 0.3;
    }), {timeout:45_000}).toBe(true);
    await skip.click();
  } else {
    await expect.poll(async () => Number(await dialog.getAttribute("data-frame")),
      {timeout:90_000, intervals:[1000]}).toBeGreaterThan(400);
    await page.screenshot({path:testInfo.outputPath("credits-first-page.png")});
    await expect.poll(async () => Number(await dialog.getAttribute("data-frame")),
      {timeout:120_000, intervals:[1000]}).toBeGreaterThan(1500);
    await page.screenshot({path:testInfo.outputPath("credits-scroll.png")});
    const litPixels = await canvas.evaluate(canvas => {
      const {data} = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height);
      let lit = 0;
      for (let i=0; i<data.length; i+=4) if (Math.max(data[i],data[i+1],data[i+2])>60) lit++;
      return lit;
    });
    expect(litPixels).toBeGreaterThan(32);
    expect((await read()).character.storyFlags[flag]).not.toBe(true);
    await expect(dialog).toHaveAttribute("data-phase", "logo", {timeout:900_000});
    // The original slate fades in. Inspect it in its fully lit hold rather
    // than catching an empty alpha-zero frame at the phase boundary.
    await page.waitForFunction(() => {
      const layer = document.querySelector('[aria-label="Closing credits"]');
      return layer?.dataset.phase === "logo" && Number(layer.dataset.frame) >= 15930;
    }, null, {timeout:5000, polling:50});
    const brightLogoPixels = await canvas.evaluate(canvas => {
      const pixels = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      let bright = 0;
      for (let i=0; i<pixels.length; i+=4) if (Math.max(pixels[i], pixels[i+1], pixels[i+2])>128) bright++;
      return bright;
    });
    expect(brightLogoPixels).toBeGreaterThan(100);
    await page.screenshot({path:testInfo.outputPath("credits-logo.png")});
  }
  await expect(dialog).toHaveCount(0, {timeout:90_000});
  await expect.poll(async () => !!(await read()).character.storyFlags[flag], {timeout:30_000}).toBe(true);
  await page.waitForFunction(() => {
    const p = window.storyProbe;
    return p.regions.controller.status === "idle" && !p.lifecycle.getController().movementLocked;
  });
  const after = await read();
  expect(after.character.worldId).toBe("s1-voyage");
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  const position = () => page.evaluate(() => window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  const first = await position();
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await expect.poll(async () => {
      const now = await position();
      return Math.hypot(now[0]-first[0], now[2]-first[2]);
    }, {timeout:5000}).toBeGreaterThan(0.2);
  } finally {
    await page.keyboard.up("KeyW");
  }
  await page.reload();
  await enterStoryWorld(page, character.name);
  await page.waitForFunction(() => window.storyProbe?.ready && window.storyProbe.regions?.controller.status === "idle"
    && window.storyProbe.lifecycle.worldRuntime.ready && !window.storyProbe.lifecycle.getController().movementLocked);
  expect((await read()).character.storyFlags[flag]).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
}
