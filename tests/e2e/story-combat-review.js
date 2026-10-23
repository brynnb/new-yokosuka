import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";

// Read-only diagnostics around real combat and physical keyboard input. This is
// a presentation investigation, not a claim of successful Story progression.
export async function reviewStoryFight(page, testInfo) {
  const characterId = await page.evaluate(() => window.storyProbe.regions.getCharacter().id);
  const saved = () => page.request.get(`/api/characters/${characterId}/state`).then(r => r.json());
  const before = await saved();
  const returnState = await page.evaluate(() => window.storyProbe.combatRuntime.active.snapshot);
  await expect(page.locator("#combat-move-list")).toBeHidden();
  await expect(page.locator("#combat-command-feedback")).toBeHidden();
  await page.locator("#combat-move-count").click();
  await expect(page.locator("#combat-move-list")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("combat-review-move-list.png") });
  await page.locator("#combat-move-count").click();
  await expect(page.locator("#combat-move-list")).toBeHidden();
  const panel = await page.locator("#dialogue-overlay .dialogue-panel").boundingBox();
  expect(panel.height).toBeLessThan(160);
  const targets = await page.locator("#dialogue-overlay button").evaluateAll(buttons =>
    buttons.map(button => button.getBoundingClientRect().height));
  expect(targets.length).toBe(5);
  expect(targets.every(height => height >= 44)).toBe(true);
  await page.evaluate(() => {
    const encounter = window.storyProbe.combatRuntime.encounter;
    const trace = window.storyProbe.combatReview = { frames: [], events: [] };
    const update = encounter.update.bind(encounter);
    let nextSample = 0;
    encounter.update = dt => {
      const events = update(dt), now = performance.now();
      for (const event of events) trace.events.push({ at: now, ...event });
      if (now >= nextSample) {
        nextSample = now + 150;
        trace.frames.push({ at: now, target: encounter.player.targetId,
          actors: [...encounter.combat.combatants.values()].map(c => ({
            id: c.id, x: c.x, z: c.z, yaw: c.yaw, hp: c.health,
            action: c.action?.moveId, tick: c.action?.tick,
            guard: c.guardHeld, reaction: c.reaction?.kind,
            partner: c.action?.pairedTargetId || c.reaction?.pairedAttackerId,
            hitStun: c.hitStun, guardStun: c.guardStun,
          })),
        });
      }
      return events;
    };
  });
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyI");
  await page.evaluate(() => { window.storyProbe.combatReview.guardStart = performance.now(); });
  try {
    // First observe sustained defence without attacks suppressing it.
    let capturedPair = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      if (!capturedPair && await page.evaluate(() => !!window.storyProbe.combatRuntime?.encounter?.player.reaction?.pairedAttackerId)) {
        await page.screenshot({ path: testInfo.outputPath("combat-review-paired-throw.png") });
        await page.waitForTimeout(750);
        await page.screenshot({ path: testInfo.outputPath("combat-review-paired-throw-later.png") });
        capturedPair = true;
      }
    }
    await page.evaluate(() => { window.storyProbe.combatReview.guardEnd = performance.now(); });
    await page.screenshot({ path: testInfo.outputPath("combat-review-guard.png") });
  } finally {
    await page.keyboard.up("KeyI");
    const trace = await page.evaluate(() => window.storyProbe.combatReview);
    await writeFile(testInfo.outputPath("combat-review.json"), JSON.stringify(trace));
    await testInfo.attach("combat-review", { body: JSON.stringify(trace), contentType: "application/json" });
    console.info("Combat review", JSON.stringify({ frames: trace.frames.length,
      events: trace.events.length, final: trace.frames.at(-1),
      hits: trace.events.filter(e => ["hit", "guarded"].includes(e.type)).length,
    }));
    const defence = trace.events.filter(e => e.at > trace.guardStart + 200 && e.at < trace.guardEnd && e.defenderId === "AKIR");
    expect(defence.filter(e => e.type === "hit" && e.moveId !== "shoulderBuster")).toEqual([],
      "held guard blocks strikes, and a throw's victim is not interrupted by another fighter");
    expect(defence.some(e => e.type === "guarded")).toBe(true);
  }
  await page.locator("#renderCanvas").focus();
  await page.keyboard.press("KeyK");
  await expect(page.locator("#combat-command-feedback")).toBeVisible();
  await page.keyboard.press("KeyX");
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  const restored = await page.evaluate(() => {
    const p = window.storyProbe, c = p.lifecycle.getController();
    return { position: c.collider.position.asArray(), firstPerson: c.firstPerson,
      active: !!p.combatRuntime.active, locked: c.movementLocked,
      leases: p.lifecycle.scheduledActors.activityActorOwners.size };
  });
  expect(restored.active).toBe(false); expect(restored.locked).toBe(false); expect(restored.leases).toBe(0);
  expect(restored.firstPerson).toBe(returnState.controllerState.firstPerson);
  restored.position.forEach((v, i) => expect(v).toBeCloseTo(returnState.position[i], 2));
  const after = await saved();
  expect(after.character.storyFlags).toEqual(before.character.storyFlags);
  expect(after.character.currentHp).toBe(before.character.currentHp);
  expect(after.character.yen).toBe(before.character.yen);
  await page.screenshot({ path: testInfo.outputPath("combat-review-cancelled.png") });
  await page.waitForTimeout(1200);
  console.info("Combat return diagnostic", JSON.stringify(await page.evaluate(() => {
    const p = window.storyProbe, c = p.lifecycle.getController(), camera = c.camera, player = p.lifecycle.playerRuntime;
    const bounds = player.modelRoot.getHierarchyBoundingVectors(true);
    const ray = camera.getForwardRay(10);
    const hits = c.scene.multiPickWithRay(ray, m => m.isEnabled() && m.isVisible)
      .sort((a,b) => a.distance-b.distance).slice(0,5).map(h=>({name:h.pickedMesh.name,d:h.distance,parent:h.pickedMesh.parent?.name,material:h.pickedMesh.material?.name}));
    return { distance:c.cameraDistance,resolved:c.cameraResolvedDistance,target:c.cameraTarget.asArray(),
      camera:camera.position.asArray(),fov:camera.fov,hits,
      root:player.modelRoot.position.asArray(),scaling:player.modelRoot.scaling.asArray(),
      bounds:[bounds.min.asArray(),bounds.max.asArray()],
      animation:player.animation.state,oneShot:player.animation.activeOneShot,
      visibility:player.modelRoot.isEnabled(),actor:c.actorRoot.position.asArray(),
      ownsPlayer:p.regions.controller.ownsPlayerPresentation,
    };
  })), "saved", JSON.stringify({position:returnState.position,controllerState:returnState.controllerState,cameraYaw:returnState.cameraYaw}));
  await page.screenshot({path:testInfo.outputPath("combat-review-settled.png")});
}
