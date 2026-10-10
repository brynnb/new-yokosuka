import { expect, test } from "@playwright/test";
import { ARCADE_SCORE_MACHINE_IDS } from "../../src/ArcadeScoreClient.js";
import { WORLDS } from "../../play/config/worlds.js";

const shenmue2 = process.env.PLAYWRIGHT_PREPARED_GAME === "shenmue2";
const worldPairs = shenmue2
  ? ["s2ara0", "s2ar02", "s2we00", "s2d2ara0", "s2d3q100", "s2d4qgbt", "s2d4ksh1"].map(id => [id, id])
  : [["interior", "interior"], ["arcade", "arcade"], ["mfbt", "mfbt"], ["ma00", "mfsy"], ["ma00race", "ma00race"]];
const firstWorld = WORLDS[worldPairs[0][0]];

test("default local loading uses prepared interiors and activity worlds with their gameplay owners", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_PREPARED_SCENERY !== "true", "Opt-in check requires locally built scenery bundles");
  test.setTimeout(480_000);
  const errors = [];
  const bundles = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (/\/scenery-output\/[^/]+\/world\.bin$/.test(response.url())) {
      bundles.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.sceneryTest = { ready: false, errors: [] };
  });
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/arcade-scores", route => route.fulfill({ json: {
    scores: ARCADE_SCORE_MACHINE_IDS.map(machineId => ({machineId, score: 0})),
  } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 10, 29, 10),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [{
    id: 42, name: "Scenerytester", avatarId: "ryo", worldId: firstWorld.id,
    lastLoginAt: "2026-01-01T00:00:00Z", x: firstWorld.spawn.x, y: firstWorld.spawn.y, z: firstWorld.spawn.z, yaw: firstWorld.yaw,
  }] } }));
  // Real app, travel, renderer, collision and fixture owners. Fake only the
  // account/transport boundary so this check cannot create or move a real user.
  // Exclude the unrelated externally hosted house TV, not the arcade screens.
  // Instrument the served module itself: a running Vite server can attach HMR
  // timestamps, so importing another unversioned copy would patch the wrong class.
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument('play/world/PlayWorldLifecycle.js', `
    const sceneryInitialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(options) {
      window.sceneryTest.lifecycle = this;
      return sceneryInitialize.call(this, options);
    };
  `);
  await instrument('play/multiplayer/MultiplayerSession.js', `
    MultiplayerSession.prototype.connect = function() {};
  `);
  await instrument('play/arcade/ArcadeAttractScreens.js', `
    const sceneryCreateScreen = ArcadeAttractScreens.prototype.create;
    ArcadeAttractScreens.prototype.create = function(id) {
      if (this.definitions[id]?.audioChannel === 'tv') return null;
      return sceneryCreateScreen.call(this, id);
    };
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.sceneryTest;
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message);
      probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  await page.locator('.account-intro-prompt').waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator('.account-shell-characters button').filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.sceneryTest.ready || window.sceneryTest.errors.length, null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.sceneryTest.errors)).toEqual([]);

  for (const [worldId, bundleKey] of worldPairs) {
    if (worldId !== firstWorld.id) await page.evaluate(id => window.sceneryTest.lifecycle.travelToWorld(id), worldId);
    await page.waitForFunction(id => {
      const world = window.sceneryTest.lifecycle.worldRuntime;
      return world.activeWorld.id === id && world.ready && !world.switching;
    }, worldId, { timeout: 120_000 });
    if (worldId === "ma00" || worldId === "ma00race") {
      // Vehicles are server-owned, not created by map loading. Supply the
      // normal snapshot boundary using the world's authored spawn records.
      await page.evaluate(async () => {
        const { worldRuntime, forkliftAssembly } = window.sceneryTest.lifecycle;
        const world = worldRuntime.activeWorld;
        forkliftAssembly.network.replaceServerSnapshot(world.forkliftSpawns.map(spawn => ({
          id: spawn.id, worldId: world.id, x: spawn.position.x, y: spawn.position.y,
          z: spawn.position.z, yaw: spawn.yaw, ownerId: '',
        })));
        await Promise.all(forkliftAssembly.fleetRuntime.loads.values());
      });
    }
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const lifecycle = window.sceneryTest.lifecycle;
      return {
        prepared: Boolean(lifecycle.sceneState.preparedSceneryResources),
        position: lifecycle.getController().collider.position.asArray(),
        visibleMeshes: lifecycle.scene.getActiveMeshes().length,
        arcadeScreens: [...lifecycle.arcade.attractScreens.entries.keys()],
        combat: lifecycle.dom.app.classList.contains('combat-mode'),
        forklifts: lifecycle.forkliftAssembly.fleet.size,
        nativeDoors: lifecycle.doorInteractions.entries.filter(door => door.type.startsWith('shenmue2-')).length,
      };
    });
    expect(result.prepared).toBe(true);
    expect(result.visibleMeshes).toBeGreaterThan(0);
    expect(result.position.every(Number.isFinite)).toBe(true);
    expect(Math.abs(result.position[1] - WORLDS[worldId].spawn.y)).toBeLessThan(3);
    expect(bundles).toContainEqual({ path: `/scenery-output/${bundleKey}/world.bin`, status: 200 });
    if (worldId === "arcade") expect(result.arcadeScreens.length).toBeGreaterThanOrEqual(3);
    if (worldId === "mfbt") expect(result.combat).toBe(true);
    if (["s2ara0", "s2ar02", "s2we00"].includes(worldId)) expect(result.nativeDoors).toBeGreaterThan(0);
    if (worldId === "ma00" || worldId === "ma00race") expect(result.forklifts).toBeGreaterThan(0);
    await testInfo.attach(`${worldId}-state`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`${worldId}.png`) });
    if (worldId === "arcade") {
      await page.evaluate(() => {
        const lifecycle = window.sceneryTest.lifecycle;
        lifecycle.resetPlayer(lifecycle.getController().collider.position.clone(),
          lifecycle.worldRuntime.activeWorld.yaw + Math.PI, { persist: false });
      });
      await page.locator('#renderCanvas').focus();
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath('arcade-inward.png') });
      await page.keyboard.press('KeyR');
    }
  }
  // A fresh checkout can have only some bundles built. Exercise the real
  // original-asset path after a bundled session, without reusing its geometry.
  await page.route(`**/scenery-output/${firstWorld.id}/world.json`, route => route.fulfill({status: 404, body: "Bundle not built"}));
  await page.evaluate(id => window.sceneryTest.lifecycle.travelToWorld(id), firstWorld.id);
  await page.waitForFunction(id => {
    const {worldRuntime} = window.sceneryTest.lifecycle;
    return worldRuntime.activeWorld.id === id && worldRuntime.ready && !worldRuntime.switching;
  }, firstWorld.id, {timeout: 120_000});
  const original = await page.evaluate(() => {
    const lifecycle = window.sceneryTest.lifecycle;
    return {
      prepared: Boolean(lifecycle.sceneState.preparedSceneryResources),
      visibleMeshes: lifecycle.scene.getActiveMeshes().length,
      position: lifecycle.getController().collider.position.asArray(),
    };
  });
  expect(original.prepared).toBe(false);
  expect(original.visibleMeshes).toBeGreaterThan(0);
  expect(original.position.every(Number.isFinite)).toBe(true);
  expect(Math.abs(original.position[1] - firstWorld.spawn.y)).toBeLessThan(3);
  await page.screenshot({path: testInfo.outputPath(`${firstWorld.id}-original-fallback.png`)});
  expect(errors).toEqual([]);
});
