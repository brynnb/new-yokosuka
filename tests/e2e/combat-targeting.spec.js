import { expect, test } from "@playwright/test";
import { WORLDS } from "../../play/config/worlds.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

test("Combat Practice renders four opponents and switches targets in camera space", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  // Unpublished Story assets can be regenerated locally. Serve only exact
  // content-addressed matches, never a dummy or another character's textures.
  await page.route("**/r2-assets/shenmue/runtime/**", async route => {
    const match = /\/runtime\/([a-f0-9]{64})\/(.+)$/.exec(new URL(route.request().url()).pathname);
    if (match && !match[2].split("/").includes("..")) {
      for (const root of [process.cwd(), process.env.NEW_YOKOSUKA_TEST_ASSET_ROOT].filter(Boolean)) {
        const filename = path.join(root, match[2]);
        if (fs.existsSync(filename) && createHash("sha256").update(fs.readFileSync(filename)).digest("hex") === match[1]) {
          return route.fulfill({ path: filename });
        }
      }
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.combatProbe = { ready: false, errors: [] };
  });
  const world = WORLDS.mfbt;
  const character = { id: 42, name: "Targettester", avatarId: "ryo", playMode: "free_roam",
    worldId: world.id, x: world.spawn.x, y: world.spawn.y, z: world.spawn.z, yaw: world.yaw,
    lastLoginAt: "2026-01-01T00:00:00Z" };
  // Mock account/transport only; models, animations, input, camera, combat,
  // scene loading and travel all run through the actual application.
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [character] } }));
  await page.route("**/api/characters/42/state", route => route.fulfill({ json: { character, inventory: [] } }));
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument("play/world/PlayWorldLifecycle.js", `
    const initialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(...args) {
      window.combatProbe.lifecycle = this;
      return initialize.apply(this, args);
    };
  `);
  await instrument("play/characters/PlayerCombatRuntime.js", `
    const activate = PlayerCombatRuntime.prototype.setActive;
    PlayerCombatRuntime.prototype.setActive = function(...args) {
      window.combatProbe.runtime = this;
      return activate.apply(this, args);
    };
  `);
  await instrument("play/multiplayer/MultiplayerSession.js", `
    MultiplayerSession.prototype.connect = function() {};
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.combatProbe;
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message); probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  console.info("Combat browser check: opening account menu");
  await page.locator(".account-intro-prompt").waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".account-shell-characters button").filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.combatProbe.ready || window.combatProbe.errors.length,
    null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.combatProbe.errors)).toEqual([]);
  await expect(page.locator("#loading")).toHaveClass(/hidden/);
  console.info("Combat browser check: arena loaded, checking targets");
  await page.evaluate(() => {
    const controller = window.combatProbe.runtime.getController();
    controller.cameraDistance = 6;
  });
  await expect(page.locator(".combat-target-indicator")).toBeVisible();
  expect(await page.evaluate(() => window.combatProbe.runtime.enemies.filter(entry =>
    entry.root.isEnabled() && entry.modelRoot.getChildMeshes().some(mesh => mesh.isEnabled() && mesh.isVisible)
  ).length)).toBe(4);
  await page.screenshot({ path: testInfo.outputPath("combat-four-opponents.png") });

  const switchTarget = async direction => {
    const expected = await page.evaluate(direction => {
      const runtime = window.combatProbe.runtime, encounter = runtime.encounter;
      const candidates = runtime.targetIndicator.projectTargets(encounter.enemies)
        .filter(entry => entry.visible && !entry.defeated).sort((a, b) => a.screenX - b.screenX || a.id.localeCompare(b.id));
      const current = candidates.findIndex(entry => entry.id === encounter.player.targetId);
      const index = current < 0 ? (direction === "left" ? candidates.length - 1 : 0)
        : (current + (direction === "left" ? -1 : 1) + candidates.length) % candidates.length;
      return candidates[index].id;
    }, direction);
    await page.keyboard.press(direction === "left" ? "KeyQ" : "KeyE");
    await expect(page.locator("#combat-enemy-gauge")).toHaveAttribute("data-target-id", expected);
    return expected;
  };
  for (const direction of ["right", "right", "left", "left", "left"]) {
    await switchTarget(direction);
    await expect.poll(() => page.evaluate(() => {
      const { encounter } = window.combatProbe.runtime;
      const delta = encounter.playerActor.yaw() - encounter.playerTargetYaw();
      return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    })).toBeLessThan(0.01);
  }
  await page.screenshot({ path: testInfo.outputPath("combat-selected-partner.png") });

  // Orbit the real gameplay camera to the other side: world-X/spawn order
  // implementations would now select in the wrong visual direction.
  const initialOrder = await page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    return runtime.targetIndicator.projectTargets(runtime.encounter.enemies).sort((a, b) => a.screenX - b.screenX).map(e => e.id);
  });
  await page.evaluate(() => { window.combatProbe.runtime.getController().cameraYaw += Math.PI; });
  await page.waitForTimeout(400);
  const orbitOrder = await page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    return runtime.targetIndicator.projectTargets(runtime.encounter.enemies).sort((a, b) => a.screenX - b.screenX).map(e => e.id);
  });
  expect(orbitOrder).not.toEqual(initialOrder);
  await switchTarget("right");
  await switchTarget("left");
  await page.screenshot({ path: testInfo.outputPath("combat-camera-orbit.png") });

  // Control exit hides targeting; keys in exploration must not queue a later switch.
  await page.keyboard.press("KeyX");
  await expect(page.locator("#combat-enemy-gauge")).toBeHidden();
  await expect(page.locator(".combat-target-indicator")).toBeHidden();
  const previous = await page.evaluate(() => window.combatProbe.runtime.encounter.player.targetId);
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyX");
  await expect(page.locator("#combat-enemy-gauge")).toBeVisible();
  await expect(page.locator("#combat-enemy-gauge")).toHaveAttribute("data-target-id", previous);
  await page.evaluate(() => { window.combatProbe.runtime.getController().cameraYaw -= Math.PI; });

  await page.keyboard.press("KeyR");
  await expect.poll(() => page.evaluate(() => window.combatProbe.runtime.getController().firstPerson)).toBe(true);
  await switchTarget("right");
  await expect.poll(() => page.evaluate(() => {
    const runtime = window.combatProbe.runtime;
    const delta = runtime.getController().cameraYaw - runtime.encounter.playerTargetYaw() - Math.PI;
    return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  })).toBeLessThan(0.01);
  await page.screenshot({ path: testInfo.outputPath("combat-first-person-target.png") });
  await page.keyboard.press("KeyR");

  console.info("Combat browser check: selected throw recipient and animation handoff");
  // Stage a controlled two-recipient range check. Keep real animations and
  // command processing, but prevent AI interruption from making it random.
  await page.evaluate(() => {
    const runtime = window.combatProbe.runtime, encounter = runtime.encounter;
    encounter.resetCombatants();
    const p = encounter.playerActor.position(), yaw = encounter.playerActor.yaw();
    for (const entry of encounter.enemies) entry.ai = null;
    encounter.player.targetId = "partner-left";
    encounter.enemies.find(e => e.id === "partner-left").actor.setCombatPosition(
      p.x + Math.sin(yaw) * 0.9, p.z + Math.cos(yaw) * 0.9, yaw + Math.PI);
    encounter.enemies.find(e => e.id === "enemy").actor.setCombatPosition(
      p.x + Math.cos(yaw) * 0.65, p.z - Math.sin(yaw) * 0.65, yaw + Math.PI);
    runtime.getController().cameraYaw = yaw + Math.PI;
  });
  await page.keyboard.press("KeyW");
  await page.keyboard.press("KeyS");
  await page.keyboard.press("KeyL");
  await page.waitForFunction(() => {
    const action = window.combatProbe.runtime.encounter.player.action;
    return action?.lockedTargetId === "partner-left" && !action.acquisitionStage;
  });
  await switchTarget("right");
  expect(await page.evaluate(() => window.combatProbe.runtime.encounter.player.action.lockedTargetId)).toBe("partner-left");
  await page.screenshot({ path: testInfo.outputPath("combat-throw-keeps-original-partner.png") });
  await page.waitForFunction(() => !window.combatProbe.runtime.encounter.playerMovementLocked);
  const health = await page.evaluate(() => Object.fromEntries(window.combatProbe.runtime.encounter.enemies.map(e => [e.id, e.combatant.health / e.combatant.maxHealth])));
  expect(health["partner-left"]).toBeLessThan(1);
  expect(health.enemy).toBe(1);

  // Travel out and back uses real world ownership; no duplicate actors/labels.
  await page.evaluate(() => window.combatProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator(".combat-target-indicator")).toBeHidden();
  expect(await page.evaluate(() => window.combatProbe.runtime.enemies.every(entry => !entry.root.isEnabled()))).toBe(true);
  await page.evaluate(() => window.combatProbe.lifecycle.travelToWorld("mfbt"));
  await expect(page.locator(".combat-target-indicator")).toHaveCount(1);
  await expect(page.locator(".combat-target-indicator")).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach("runtime-errors", { body: JSON.stringify(errors), contentType: "application/json" });
});
