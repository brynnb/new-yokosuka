import { expect } from "@playwright/test";

// Exercise the actual sidebar/Yarn/socket boundary, not a locally forced pause.
export async function verifyPersonalCalendar(page, testInfo, character) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(response => response.json());
  const sample = () => page.evaluate(() => {
    const clock = window.storyProbe.clock;
    return {
      game: clock.gameDate().getTime(),
      wall: clock.serverWallTimeMs(),
      paused: clock.worldState.paused,
      label: document.querySelector("#world-game-time").textContent,
    };
  });
  const idle = async () => {
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
    await expect.poll(() => page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  };
  const open = async () => {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option", { name: "Wait until tomorrow morning", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keep exploring", exact: true })).toBeVisible();
    await expect.poll(async () => (await sample()).paused).toBe(true);
    // Allow the normal HUD refresh to consume the authoritative snapshot.
    await page.waitForTimeout(1_100);
  };
  await idle();
  const initial = await saved();
  await open();
  const before = await sample();
  await page.waitForTimeout(5_000);
  const during = await sample();
  expect(during.game).toBe(before.game);
  expect(during.label).toBe(before.label);
  expect(during.wall - before.wall).toBeGreaterThan(4_500);
  const paused = await saved();
  expect(paused.worldState.paused).toBe(true);
  expect(paused.worldState.gameTimeMs).toBe(before.game);
  expect(Math.abs(paused.worldState.serverTimeMs - during.wall)).toBeLessThan(2_000);
  await page.screenshot({ path: testInfo.outputPath("personal-clock-paused-choice.png") });
  await page.getByRole("button", { name: "Keep exploring", exact: true }).click();
  await idle();
  await expect.poll(async () => (await sample()).paused).toBe(false);
  await expect.poll(async () => (await sample()).game).toBeGreaterThan(before.game);

  await open();
  await page.getByRole("button", { name: "Wait until tomorrow morning", exact: true }).click();
  await idle();
  await expect.poll(async () => (await sample()).paused).toBe(false);
  const final = await saved();
  expect(final.character.yen).toBe(initial.character.yen);
  expect(final.inventory).toEqual(initial.inventory);
  expect(final.character.storyFlags).toEqual(initial.character.storyFlags);
  expect(new Date(final.worldState.gameTimeMs).getUTCHours()).toBe(8);
  expect(Math.abs((await sample()).game - final.worldState.gameTimeMs)).toBeLessThan(5_000);
  await page.screenshot({ path: testInfo.outputPath("personal-clock-resumed-morning.png") });
}
