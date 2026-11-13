import { expect } from "@playwright/test";
import { useStoryInspectable } from "./story-object-input.js";

// Continue an isolated phone/directory checkpoint; the caller records any
// seeded predecessors. An unfinished directory is earned here. From its counter to
// the bus, use keyboard walking and the normal object picker: no resetPlayer,
// direct travel, authored-time override or future-flag seeding in this helper.
export async function verifyEarnedHarborBus(page, testInfo, character, {
  walkToLandmark, verifyDirectory, enterStoryWorld,
}) {
  const saved = async () => {
    const response = await page.request.get(`/api/characters/${character.id}/state`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const arrivalFlag = "story.s1.harbor-arrival.completed";
  const pendingFlag = "story.s1.harbor-arrival-film.pending";
  const filmFlag = "story.s1.harbor-arrival-film.completed";
  let initial = await saved();
  const directoryCompletedBeforeRun = initial.character.storyFlags["story.s1.amihama-directory.completed"] === true;
  expect(initial.character.storyFlags[arrivalFlag]).not.toBe(true);
  expect(initial.character.storyFlags[pendingFlag]).not.toBe(true);
  expect(initial.character.storyFlags[filmFlag]).not.toBe(true);
  if (!initial.character.storyFlags["story.s1.amihama-directory.completed"]) {
    expect(initial.character.storyFlags["story.s1.master-chen-phone.completed"]).toBe(true);
    await verifyDirectory(page, testInfo, initial.character, { earned: true });
    initial = await saved();
  }
  expect(initial.character.storyFlags["story.s1.amihama-directory.completed"]).toBe(true);
  const departure = await page.evaluate(() => {
    const life = window.storyProbe.lifecycle;
    return { world: life.worldRuntime.activeWorld.id,
      position: life.getController().collider.position.asArray() };
  });
  expect(departure.world, "Resume at the earned Dobuita directory checkpoint").toBe("dobuita");
  expect(Math.hypot(departure.position[0] + 37.4, departure.position[2] - 10.2),
    "This check must begin at the tobacco counter, not an arbitrary seeded bus position").toBeLessThan(4);
  await page.screenshot({ path: testInfo.outputPath("earned-bus-directory-departure.png") });
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  await expect.poll(() => page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.evaluate(() => {
    const life = window.storyProbe.lifecycle, controller = life.getController();
    controller.cameraPitch = 0;
    controller.updateCamera(1);
    const probe = window.earnedBusWalkProbe = { events: [], samples: [], frames: 0 };
    probe.key = event => {
      if (event.code === "KeyW") probe.events.push({ type: event.type, code: event.code,
        target: event.target?.id || event.target?.tagName });
    };
    window.addEventListener("keydown", probe.key, true);
    window.addEventListener("keyup", probe.key, true);
    probe.observer = life.scene.onAfterRenderObservable.add(() => {
      if (++probe.frames % 15 !== 0) return;
      const c = life.getController();
      probe.samples.push({ position: c.collider.position.asArray(), forward: c.keys.has("KeyW"),
        movementLocked: c.movementLocked, lockOwners: c.movementLockOwners?.size,
        status: window.storyProbe.regions.controller.status,
        focus: document.activeElement?.id || document.activeElement?.tagName });
      if (probe.samples.length > 40) probe.samples.shift();
    });
  });
  try {
    // Original D000/0000 booth wall 0xc0bc0 blocks the direct northwest exit;
    // 0xbe098 also separates the bus-side road from the street above it.
    // Follow the original CMAL pedestrian exit, then the AKMI bus-side route,
    // retained in play/data/scheduled-actors/dobuita.json, around both endpoints.
    // The isolated predecessor may begin at CMAL's original standing point
    // [-37.156082, 0.072399, 9.415105]; directory/arrival outcomes remain unset.
    // Skip an already reached first point before holding W, avoiding a tiny
    // floating-point direction while the walking helper advances its waypoint.
    // Stop on the reachable side of native blocking segment 0xc32c8:
    // [-46.000, 8.112] -> [-45.055, 10.157]. The farther bus-side point
    // [-46.5, 9.3] crosses that boundary; this approach remains inside the
    // unchanged client/server boarding bounds [-54,-1,1]..[-44,3,11].
    const route = [[-37.156, 9.415], [-36.945, 8.464], [-37.005, 6.58],
      [-37.675, 5.274], [-39.387, 5.703], [-42.938, 7.494], [-45.0, 8.5]];
    const first = Math.hypot(departure.position[0] - route[0][0],
      departure.position[2] - route[0][1]) < .45 ? 1 : 0;
    await walkToLandmark(page, testInfo, {
      world: "dobuita", label: "tobacco counter to bus", maxSteps: 300,
      arrivalRadius: .3, targets: route.slice(first),
    });
  } finally {
    const probe = await page.evaluate(() => {
      const p = window.earnedBusWalkProbe;
      window.removeEventListener("keydown", p.key, true);
      window.removeEventListener("keyup", p.key, true);
      window.storyProbe.lifecycle.scene.onAfterRenderObservable.remove(p.observer);
      delete window.earnedBusWalkProbe;
      return { events: p.events, samples: p.samples };
    });
    await testInfo.attach("earned-bus-walk-input", {
      body: JSON.stringify(probe, null, 2), contentType: "application/json",
    });
  }
  const approach = await page.evaluate(() => {
    const life = window.storyProbe.lifecycle;
    return { world: life.worldRuntime.activeWorld.id,
      position: life.getController().collider.position.asArray() };
  });
  expect(approach.world).toBe("dobuita");
  for (const [axis, min, max] of [[0, -54, -44], [1, -1, 3], [2, 1, 11]]) {
    expect(approach.position[axis], "Physical approach must satisfy existing boarding bounds").toBeGreaterThanOrEqual(min);
    expect(approach.position[axis], "Physical approach must satisfy existing boarding bounds").toBeLessThanOrEqual(max);
  }
  await testInfo.attach("earned-bus-physical-approach", {
    body: JSON.stringify(approach, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("earned-bus-physical-approach.png") });
  const bus = { world: "dobuita", tag: "BUS_", reposition: false,
    expectedChoice: "Board the bus to Amihama" };
  const idle = async world => {
    await expect.poll(() => page.evaluate(() => {
      const probe = window.storyProbe, life = probe.lifecycle;
      return { status: probe.regions.controller.status,
        cutsceneActive: Boolean(probe.director?.activeCutscene),
        movementLocked: life.getController().movementLocked,
        activityActorOwners: life.scheduledActors.activityActorOwners.size,
        world: life.worldRuntime.activeWorld?.id, ready: life.worldRuntime.ready };
    }), { timeout: 30_000 }).toEqual({ status: "idle", cutsceneActive: false,
      movementLocked: false, activityActorOwners: 0, world, ready: true });
    await expect(page.locator("#loading-error")).not.toBeVisible();
  };
  const unchangedResources = state => {
    expect(state.character.yen).toBe(initial.character.yen);
    expect(state.character.currentHp).toBe(initial.character.currentHp);
    expect(state.inventory).toEqual(initial.inventory);
  };
  const scene = async id => {
    await page.waitForFunction(id => window.storyProbe.director?.activeCutscene?.cutscene.id === id
      || window.storyProbe.sceneErrors.length, id, { timeout: 120_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  };
  const noBoardingReceipt = async () => {
    const state = await saved();
    expect(state.character.worldId).toBe("dobuita");
    for (const flag of [arrivalFlag, pendingFlag, filmFlag]) expect(state.character.storyFlags[flag]).not.toBe(true);
    unchangedResources(state);
  };
  await useStoryInspectable(page, bus);
  await page.getByRole("button", { name: "Stay in Dobuita", exact: true }).click();
  await idle("dobuita");
  await noBoardingReceipt();
  await useStoryInspectable(page, bus);
  await page.getByRole("button", { name: bus.expectedChoice, exact: true }).click();
  await scene("story-s1-harbor-bus");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath("earned-bus-boarding-before-cancel.png") });
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("earned-bus-cancel"));
  await idle("dobuita");
  await noBoardingReceipt();
  await useStoryInspectable(page, bus);
  await page.getByRole("button", { name: bus.expectedChoice, exact: true }).click();
  await scene("story-s1-harbor-bus");
  // Both original films advance on their normal clocks. Boarding owns travel;
  // the arrival film owns a separate receipt and can be interrupted safely.
  await scene("story-s1-harbor-bus-arrival");
  const arriving = await saved();
  expect(arriving.character.worldId).toBe("mfsy");
  expect(arriving.character.storyFlags[arrivalFlag]).toBe(true);
  expect(arriving.character.storyFlags[pendingFlag]).toBe(true);
  expect(arriving.character.storyFlags[filmFlag]).not.toBe(true);
  unchangedResources(arriving);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath("earned-bus-arrival-before-cancel.png") });
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("earned-arrival-cancel"));
  await idle("mfsy");
  const cancelled = await saved();
  expect(cancelled.character.worldId).toBe("mfsy");
  expect(cancelled.character.storyFlags[arrivalFlag]).toBe(true);
  expect(cancelled.character.storyFlags[pendingFlag]).toBe(true);
  expect(cancelled.character.storyFlags[filmFlag]).not.toBe(true);
  unchangedResources(cancelled);
  await page.reload();
  await enterStoryWorld(page, character.name);
  await scene("story-s1-harbor-bus-arrival");
  expect(await page.evaluate(() => window.storyProbe.starts.includes("story-s1-harbor-bus"))).toBe(false);
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: testInfo.outputPath("earned-bus-arrival-natural-retry.png") });
  await expect.poll(async () => (await saved()).character.storyFlags[filmFlag],
    { timeout: 180_000 }).toBe(true);
  await idle("mfsy");
  const completed = await saved();
  expect(completed.character.worldId).toBe("mfsy");
  expect(completed.character.storyFlags[arrivalFlag]).toBe(true);
  expect(completed.character.storyFlags["notebook.s1.amihama"]).toBe(true);
  expect(completed.character.storyFlags["story.s1.goro-harbor.completed"]).not.toBe(true);
  unchangedResources(completed);
  await page.screenshot({ path: testInfo.outputPath("earned-bus-arrival-completed.png") });
  await page.reload();
  await enterStoryWorld(page, character.name);
  await page.waitForFunction(() => window.storyProbe.ready, null, { timeout: 120_000 });
  await idle("mfsy");
  const restored = await saved();
  expect(restored.character.storyFlags).toEqual(completed.character.storyFlags);
  expect(restored.character.worldId).toBe("mfsy");
  unchangedResources(restored);
  expect(await page.evaluate(() => window.storyProbe.starts.some(id =>
    ["story-s1-harbor-bus", "story-s1-harbor-bus-arrival"].includes(id)))).toBe(false);
  expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  await testInfo.attach("earned-bus-boundary", { contentType: "application/json",
    body: JSON.stringify({ departure, approach, directoryCompletedBeforeRun,
      directoryCompletedDuringRun: !directoryCompletedBeforeRun, walkingRepositioned: false,
      boardingCancelled: true, arrivalCancelledAndReloaded: true,
      naturalArrivalCompleted: true, completedReload: true }, null, 2) });
}
