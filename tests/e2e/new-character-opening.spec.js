import { expect, test } from "@playwright/test";

for (const [dreamExit, avatar] of [["skip", "ryo"], ["complete", "alternate"]]) {
test(`opening transitions preserve presentation and reach the bedside after dream ${dreamExit} as ${avatar}`, async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  let created = null;
  await page.addInitScript(() => localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3"));
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 10, 29, 10),
  } }));
  await page.route("**/api/characters", route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { characters: [] } });
    created = { ...route.request().postDataJSON(), id: 42, worldId: "exterior", x: -6.48, y: 0, z: -19.32, yaw: 0 };
    return route.fulfill({ json: created });
  });
  // Use the real application, account flow, scene loading and renderer. Only
  // account HTTP and the multiplayer transport are fake; no real account is made.
  // The unrelated, externally hosted house TV is excluded from this test.
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    import { NativeCutsceneDirector } from '/play/cutscenes/NativeCutsceneDirector.js';
    import { PlayWorldLifecycle } from '/play/world/PlayWorldLifecycle.js';
    import { MultiplayerSession } from '/play/multiplayer/MultiplayerSession.js';
    import { ArcadeAttractScreens } from '/play/arcade/ArcadeAttractScreens.js';
    import { LoadingScreen } from '/play/ui/LoadingScreen.js';
    import { NativeAseqActivityRuntime } from '/play/events/NativeAseqActivityRuntime.js';
    import { NativeAseqPresentationRuntime } from '/play/events/NativeAseqPresentationRuntime.js';
    import state from '/src/state.js';
    const createScreen = ArcadeAttractScreens.prototype.create;
    ArcadeAttractScreens.prototype.create = function(id) {
      if (this.definitions[id]?.audioChannel === 'tv') return null;
      return createScreen.call(this, id);
    };
    window.openingTest = { started: [], loadingCards: [], connected: [], ready: false, errors: [], transitions: [], samples: [], loads: [], releases: [], covers: [], updates: 0 };
    const probe = window.openingTest;
    const setPhase = LoadingScreen.prototype.setPhase;
    LoadingScreen.prototype.setPhase = function(phase) {
      setPhase.call(this, phase);
      probe.screen = this;
      probe.transitions.push({ phase, time: performance.now(), updates: probe.updates,
        cutsceneId: probe.director?.activeCutscene?.cutscene?.id ?? null, sceneFrame: state.scene?.getFrameId() });
      if (phase === 'covering') {
        const active = probe.director?.activeCutscene;
        probe.covers.push({ id: active?.cutscene?.id,
          faces: [...(active?.packageRuntime.presentation.faces?.active?.faces || [])]
            .map(([actor, face]) => ({ actor, enabled: face.entry.root.isEnabled() })) });
      }
    };
    const endProgram = NativeAseqPresentationRuntime.prototype.endProgram;
    NativeAseqPresentationRuntime.prototype.endProgram = function(...args) {
      if (this.programOwner && probe.director?.activeCutscene?.cutscene?.id === 'S1-OP00-DREAM') {
        const player = probe.lifecycle.playerRuntime;
        probe.lastCutsceneControllers = player.characterRuntime.presentationModel(
          player.characterLoader, player.modelRoot)?.latestControllerMatrices;
      }
      if (this.programOwner) probe.releases.push({
        id: probe.director?.activeCutscene?.cutscene?.id,
        phase: probe.screen.phase, opacity: getComputedStyle(document.querySelector('#loading')).opacity,
      });
      return endProgram.apply(this, args);
    };
    const updateActivity = NativeAseqActivityRuntime.prototype.updateActivity;
    NativeAseqActivityRuntime.prototype.updateActivity = function(...args) {
      const result = updateActivity.apply(this, args);
      if (result) probe.updates++;
      return result;
    };
    const sample = () => {
      if (['covering', 'revealing'].includes(probe.screen?.phase)) {
        probe.samples.push({ phase: probe.screen.phase, opacity: Number(getComputedStyle(document.querySelector('#loading')).opacity),
          cardVisibility: getComputedStyle(document.querySelector('.loading-card')).visibility });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const loadAssets = PlayWorldLifecycle.prototype.loadAssets;
    PlayWorldLifecycle.prototype.loadAssets = function(...args) {
      probe.loads.push({ phase: probe.screen.phase, opacity: getComputedStyle(document.querySelector('#loading')).opacity });
      return loadAssets.apply(this, args);
    };
    const start = NativeCutsceneDirector.prototype.start;
    NativeCutsceneDirector.prototype.start = async function(cutscene, options) {
      probe.director = this;
      probe.loadingCards.push({ id: cutscene.id,
        caption: document.querySelector('#loading-place-english').textContent,
        time: document.querySelector('#loading-time').textContent,
        date: document.querySelector('#loading-date').dateTime });
      if (cutscene.id === 'S1-000') {
        probe.preparingMurder = true;
        await new Promise(resolve => { probe.releaseMurder = resolve; });
      }
      const result = await start.call(this, cutscene, options);
      if (result) probe.started.push(cutscene.id);
      return result;
    };
    const initialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(options) {
      probe.lifecycle = this;
      return initialize.call(this, options);
    };
    MultiplayerSession.prototype.connect = function() {
      probe.connected.push({ worldId: this.getWorld().id, avatarId: probe.lifecycle.playerRuntime.activeCharacterId });
    };
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message);
      probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button.empty").first().click();
  // Ryo reuses the cinematic model; an alternate avatar exercises restoration
  // of a different model. Both paths need coverage at this ownership boundary.
  if (avatar === "alternate") await page.locator('[aria-label="Next character model"]').click();
  await page.locator('.character-create-form input').fill("Openingtester");
  await page.locator('.character-create-form button[type="submit"]').click();
  await expect.poll(() => created?.id).toBe(42);
  if (avatar === "ryo") expect(created?.avatarId).toBe("ryo");
  else expect(created?.avatarId).not.toBe("ryo");

  const order = ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (id === "S1-000") {
      // Hold package preparation after the geometry loader has finished. The
      // real X handler must reveal Loading, not a black cover or gameplay shot.
      await page.waitForFunction(() => window.openingTest.preparingMurder, null, { timeout: 120_000 });
      await expect(page.locator('.map-loading')).toHaveCSS('visibility', 'visible');
      await expect(page.locator('.map-loading')).toHaveCSS('opacity', '1');
      await expect(page.locator('#loading-word')).toHaveText('Loading');
      await expect(page.locator('#loading-place-english')).toHaveText('Yokosuka');
      await expect(page.locator('#loading-time')).toHaveText('4:00 pm');
      await expect(page.locator('#loading-date')).toHaveAttribute('datetime', '1986-11-29');
      await page.waitForTimeout(5200);
      await expect(page.locator('.map-loading')).toHaveCSS('visibility', 'visible');
      await page.screenshot({ path: testInfo.outputPath('skip-loading.png') });
      await page.evaluate(() => window.openingTest.releaseMurder());
    }
    await page.waitForFunction(id => window.openingTest.started.includes(id) || window.openingTest.errors.length, id, { timeout: 120_000 });
    expect(await page.evaluate(() => window.openingTest.errors)).toEqual([]);
    expect(await page.evaluate(() => window.openingTest.connected)).toEqual([]);
    expect(await page.evaluate(() => window.openingTest.lifecycle.nativeStoryRuntime.ownsPlayerPresentation)).toBe(true);
    await expect(page.locator("body")).toHaveClass(/cutscene-active/);
    await expect(page.locator("body")).not.toHaveClass(/account-menu-visible/);
    await page.waitForTimeout(2000);
    if (id === 'S1-OP00-DREAM') {
      // Skip from the Lan Di memory itself, not its initial sleeping-in-bed
      // shot: the memory owns the environment that used to flash blue.
      for (let step = 0; step < 20; step++) {
        const slot = await page.evaluate(() => window.openingTest.director.activeCutscene?.packageRuntime.activityRuntime.active?.record.slot);
        if (slot >= 30 && slot <= 46) break;
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
      }
      const slot = await page.evaluate(() => window.openingTest.director.activeCutscene?.packageRuntime.activityRuntime.active?.record.slot);
      expect(slot).toBeGreaterThanOrEqual(30);
      expect(slot).toBeLessThanOrEqual(46);
    }
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`) });
    if ((i === 1 && avatar === "alternate") || (i === 3 && dreamExit === "skip")) {
      await page.keyboard.press('KeyX');
      await expect(page.locator('#loading')).toHaveClass(/covering/);
      await expect(page.locator('.loading-card')).toHaveCSS('visibility', 'hidden');
      await expect(page.locator('.sidebar')).not.toBeVisible();
      await page.waitForTimeout(250);
      await page.screenshot({ path: testInfo.outputPath(id + '-fade-to-black.png') });
      continue;
    }
    // Exercise the real five-second transport. Completion is still emitted by
    // the native runner, not synthesized by this test. This is not real-time QA.
    for (let step = 0; step < 150; step++) {
      const active = await page.evaluate(id => window.openingTest.director.activeCutscene?.cutscene?.id === id, id);
      if (!active) break;
      const covering = await page.evaluate(() => window.openingTest.screen.phase === 'covering');
      if (covering) {
        await page.screenshot({ path: testInfo.outputPath(id + '-natural-fade.png') });
        break;
      }
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(id => window.openingTest.director.activeCutscene?.cutscene?.id !== id, id, { timeout: 30_000 });
  }
  await page.waitForFunction(() => window.openingTest.ready || window.openingTest.errors.length, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.openingTest.errors)).toEqual([]);
  expect(await page.evaluate(() => window.openingTest.started)).toEqual(order);
  expect(await page.evaluate(() => window.openingTest.loadingCards)).toEqual([
    { id: 'S1-OP02-00', caption: 'Guilin', time: '5:30 pm', date: '1986-11-28' },
    { id: 'S1-000', caption: 'Yokosuka', time: '4:00 pm', date: '1986-11-29' },
    { id: 'S1-OP00-MAIL', caption: '4 Days Later...', time: '8:30 am', date: '1986-12-03' },
    { id: 'S1-OP00-DREAM', caption: 'Hazuki Residence', time: '8:50 am', date: '1986-12-03' },
  ]);
  await expect(page.locator('#loading-date')).toHaveAttribute('datetime', '1986-11-29');
  await expect(page.locator('#loading-place-english')).toHaveText('Hazuki Residence Interior');
  expect(await page.evaluate(() => window.openingTest.connected)).toEqual([{ worldId: "interior", avatarId: created.avatarId }]);
  expect(await page.evaluate(() => window.openingTest.lifecycle.nativeStoryRuntime.ownsPlayerPresentation)).toBe(false);
  await expect(page.locator("body")).not.toHaveClass(/cutscene-active|account-menu-visible/);
  const position = () => page.evaluate(() => window.openingTest.lifecycle.getController().collider.position.asArray());
  const before = await position();
  expect(Math.hypot(before[0] + 17.6, before[2] - 4.1), 'reveal starts beside the bed, not at the hallway spawn').toBeLessThan(0.2);
  expect(before[1], 'feet are on the bedroom floor').toBeLessThan(0.3);
  expect(before[1], 'feet are not below the bedroom floor').toBeGreaterThan(-0.1);
  const yaw = await page.evaluate(() => window.openingTest.lifecycle.actorRoot.rotation.y);
  expect(yaw, 'faces the bedroom door').toBeCloseTo(Math.atan2(-16.752 - before[0], 1.833 - before[2]), 5);
  await page.screenshot({ path: testInfo.outputPath("bedside-arrival.png") });
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  const after = await position();
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.1);
  expect(after[2], 'forward movement heads toward the doorway').toBeLessThan(before[2]);
  await page.screenshot({ path: testInfo.outputPath("playable-interior.png") });
  if (avatar === "ryo") {
    const pose = await page.evaluate(() => {
      const player = window.openingTest.lifecycle.playerRuntime;
      const model = player.characterRuntime.presentationModel(player.characterLoader, player.modelRoot, player.actorRoot);
      const cloth = player.characterRuntime.nativeClothStates.get(player.modelRoot);
      const ownedMeshes = new Set(cloth.groups.flatMap(group => group.outputs.flatMap(output => output.meshes.map(state => state.mesh))));
      return { controllerCount: model.latestControllerMatrices?.length,
        familyCount: model.latestControllerFamily?.nodes.length,
        capturedCutscenePose: window.openingTest.lastCutsceneControllers != null,
        freshGameplayPose: model.latestControllerMatrices !== window.openingTest.lastCutsceneControllers,
        clothActive: cloth?.acquired, clothOwner: cloth?.presentationOwner,
        clothSeconds: cloth?.runtimeSeconds,
        clothMeshes: player.modelRoot.getChildMeshes().filter(mesh => mesh._mt5NativeClothOutput)
          .map(mesh => ({ name: mesh.name, gpuSkinning: mesh.computeBonesUsingShaders,
            owned: ownedMeshes.has(mesh), hasSkeleton: mesh.skeleton != null, enabled: mesh.isEnabled() })) };
    });
    await testInfo.attach("gameplay-pose-handoff", { body: JSON.stringify(pose, null, 2), contentType: "application/json" });
    expect(pose.capturedCutscenePose).toBe(true);
    expect(pose.freshGameplayPose, "gameplay supplies fresh collision controllers after releasing AUTH").toBe(true);
    expect(pose.controllerCount).toBe(37);
    expect(pose.familyCount).toBe(37);
    expect(pose.clothActive).toBe(true);
    expect(pose.clothOwner).toBeNull();
    expect(pose.clothSeconds).toBeGreaterThan(0);
    const ownedCloth = pose.clothMeshes.filter(mesh => mesh.owned);
    expect(ownedCloth.length).toBeGreaterThan(0);
    expect(ownedCloth.every(mesh => mesh.enabled && !mesh.gpuSkinning && !mesh.hasSkeleton)).toBe(true);
    // The nested outdoor-footwear model also contains authored jacket nodes,
    // but only its shoes are used. Its hidden jacket is not a CLTH output of
    // the active body and must stay hidden on its own GPU skeleton.
    expect(pose.clothMeshes.filter(mesh => !mesh.owned)
      .every(mesh => !mesh.enabled && mesh.gpuSkinning && mesh.hasSkeleton)).toBe(true);
  }
  // Ordinary gameplay travel shares the same reveal, not a cutscene-only fix.
  await page.evaluate(() => window.openingTest.lifecycle.travelToWorld('exterior'));
  const transitions = await page.evaluate(() => window.openingTest.transitions);
  for (const id of order) {
    const reveal = transitions.findIndex(event => event.phase === 'revealing' && event.cutsceneId === id);
    expect(reveal, id + ' has a reveal').toBeGreaterThanOrEqual(0);
    const hidden = transitions.slice(reveal + 1).find(event => event.phase === 'hidden');
    expect(hidden.time - transitions[reveal].time).toBeGreaterThanOrEqual(480);
    expect(hidden.time - transitions[reveal].time).toBeLessThan(1000);
    expect(hidden.updates - transitions[reveal].updates, id + ' advances underneath the fade').toBeGreaterThan(2);
  }
  const reveal = transitions.findLastIndex(event => event.phase === 'revealing');
  expect(transitions[reveal].cutsceneId).toBeNull();
  expect(transitions.at(-1).sceneFrame).toBeGreaterThan(transitions[reveal].sceneFrame);
  const samples = await page.evaluate(() => window.openingTest.samples);
  for (const phase of ['covering', 'revealing']) {
    expect(samples.some(sample => sample.phase === phase && sample.opacity > 0.1 && sample.opacity < 0.9)).toBe(true);
  }
  expect(samples.filter(sample => sample.phase === 'covering').every(sample => sample.cardVisibility === 'hidden')).toBe(true);
  const loads = await page.evaluate(() => window.openingTest.loads);
  const releases = await page.evaluate(() => window.openingTest.releases);
  const covers = await page.evaluate(() => window.openingTest.covers);
  expect(releases.map(release => release.id)).toEqual(order);
  expect(releases.every(release => release.phase === 'covered' && release.opacity === '1')).toBe(true);
  expect(covers.find(cover => cover.id === 'S1-OP02-00').faces).toContainEqual({ actor: 'SINF', enabled: true });
  await testInfo.attach('transition-timing', { body: JSON.stringify({transitions, samples, loads, releases, covers}, null, 2), contentType: 'application/json' });
  expect(loads).toEqual(loads.map(() => ({ phase: 'loading', opacity: '1' })));
  expect(errors).toEqual([]);
  await page.evaluate(() => window.openingTest.application.dispose());
});
}
