import { expect, test } from "@playwright/test";
import { ARCADE_SCORE_MACHINE_IDS } from "../../src/ArcadeScoreClient.js";

test("both Dobuita capsule machines stage the player and retain their detailed visual", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_CAPSULE_MACHINES !== "true", "Requires local Dobuita assets");
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.capsuleTest = { ready: false, errors: [] };
  });
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/arcade-scores", route => route.fulfill({ json: {
    scores: ARCADE_SCORE_MACHINE_IDS.map(machineId => ({ machineId, score: 0 })),
  } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 10, 29, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [{
    id: 42, name: "Capsuletester", avatarId: "ryo", worldId: "dobuita",
    lastLoginAt: "2026-01-01T00:00:00Z", x: -24.5, y: 0, z: 29.5, yaw: 0,
  }] } }));
  await page.route("**/api/characters/42/state", async route => route.fulfill({ json: {
    inventory: await page.evaluate(() => window.capsuleTest.inventory || []),
  } }));
  // Only replace account/transport boundaries, never create a real account or
  // send a purchase. Exercise the normal pointer routing, controller and clip.
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument("play/world/PlayWorldLifecycle.js", `
    const capsuleInitialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(options) {
      window.capsuleTest.lifecycle = this;
      return capsuleInitialize.call(this, options);
    };
  `);
  await instrument('play/interactions/InspectableInteractions.js', `
    const capsuleHint = InspectableInteractions.prototype.showHint;
    InspectableInteractions.prototype.showHint = function(text) {
      (window.capsuleTest.hints ||= []).push(text);
      return capsuleHint.call(this, text);
    };
  `);
  await instrument("play/multiplayer/MultiplayerSession.js", `
    MultiplayerSession.prototype.connect = function() {
      const client = this.client;
      const probe = window.capsuleTest;
      probe.inventory = [];
      probe.purchases = [];
      client.connected = client.welcomed = true;
      client.socket = {readyState: WebSocket.OPEN, close() {}, send(raw) {
        const message = JSON.parse(raw);
        if (message.type === 'script_event_start') {
          queueMicrotask(() => client.handleMessage(JSON.stringify({v: message.v, type: 'script_event_rejected',
            requestId: message.requestId, code: 'no_script', message: 'No published script matches this interaction.'})));
          return;
        }
        if (message.type !== 'capsule_purchase') return;
        probe.purchases.push(message);
        const kids = message.machineId === 'dobuita-gch3';
        const item = {key: kids ? 'capsule_gaciaka' : 'capsule_gacrnt1',
          name: kids ? 'Kids Akira 1' : 'NiGHTS 1', category: 'capsule_toy', quantity: 1};
        probe.inventory.push(item);
        queueMicrotask(() => client.handleMessage(JSON.stringify({v: message.v, type: 'capsule_result',
          requestId: message.requestId, machineId: message.machineId, outcome: 'purchased',
          itemKey: item.key, itemName: item.name, price: 100, yen: 500 - 100 * probe.purchases.length,
          itemModel: kids ? 'G_ITEM_GACIAKAG.MT5' : 'G_ITEM_GACRNT1G.MT5',
          inventory: probe.inventory,
        })));
      }};
    };
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.capsuleTest;
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message);
      probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  await page.locator(".account-intro-prompt").waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".account-shell-characters button").filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.capsuleTest.ready || window.capsuleTest.errors.length, null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.capsuleTest.errors)).toEqual([]);

  for (const tag of ["GCH0", "GCH3"]) {
    await page.evaluate(tag => {
      const l = window.capsuleTest.lifecycle;
      const machine = l.dobuitaInteractionProps.gachaMachines.find(m => m.definition.machineTag === tag);
      const position = machine.lowDetailRoot.getAbsolutePosition().clone();
      position.z -= 2;
      l.resetPlayer(position, 0, { persist: false });
      const controller = l.getController();
      controller.cameraYaw = 3.8;
      controller.cameraPitch = 0.28;
      controller.cameraDistance = 4;
      if (tag === 'GCH3') {
        controller.setFirstPerson(true);
        controller.cameraYaw = Math.PI;
        controller.cameraPitch = 0.35;
      }
      window.capsuleTest.beforeView = {yaw: controller.cameraYaw, pitch: controller.cameraPitch,
        distance: controller.cameraDistance, firstPerson: controller.firstPerson, mainCamera: true};
    }, tag);
    await page.waitForTimeout(800);
    const point = await page.evaluate(tag => {
      const l = window.capsuleTest.lifecycle;
      const m = l.dobuitaInteractionProps.gachaMachines.find(m => m.definition.machineTag === tag);
      const Vector3 = m.lowDetailRoot.position.constructor;
      const Matrix = m.lowDetailRoot.getWorldMatrix().constructor;
      const center = m.highDetailRoot.getAbsolutePosition().add(new Vector3(0, 0.8, 0));
      const p = Vector3.Project(center, Matrix.Identity(), l.scene.getTransformMatrix(),
        l.scene.activeCamera.viewport.toGlobal(l.engine.getRenderWidth(), l.engine.getRenderHeight()));
      const rect = l.dom.canvas?.getBoundingClientRect() || document.querySelector("#renderCanvas").getBoundingClientRect();
      return { x: rect.left + p.x * rect.width / l.engine.getRenderWidth(), y: rect.top + p.y * rect.height / l.engine.getRenderHeight() };
    }, tag);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.capsuleTest.lifecycle.interactionManager.inspectables.busy, null, { timeout: 5000 }).catch(async error => {
      const diagnostics = await page.evaluate(point => ({
        point, hitElement: document.elementFromPoint(point.x, point.y)?.outerHTML?.slice(0,300),
        hints: window.capsuleTest.hints, purchases: window.capsuleTest.purchases,
      }), point);
      console.log('Capsule interaction failure:', diagnostics);
      await testInfo.attach('interaction-failure', {contentType: 'application/json', body: JSON.stringify(diagnostics, null, 2)});
      throw error;
    });
    await page.waitForFunction(() => window.capsuleTest.lifecycle.playerRuntime.animation.activeEmote?.emote.id === "dobuitaGacha", null, { timeout: 20_000 });
    const staged = await page.evaluate(() => {
      const l = window.capsuleTest.lifecycle;
      const active = l.playerRuntime.animation.activeEmote;
      const target = l.dobuitaInteractionProps.interactionPose(active.context.inspectable);
      return { tag: active.context.inspectable.objectTag, error: l.actorRoot.position.subtract(target.position).length(),
        angleError: Math.abs(Math.atan2(Math.sin(l.actorRoot.rotation.y - target.yaw), Math.cos(l.actorRoot.rotation.y - target.yaw))),
        locked: l.getController().movementLocked, position: l.actorRoot.position.asArray(),
        models: l.dobuitaInteractionProps.gachaMachines.map(m => ({ low: m.lowDetailRoot.isEnabled(), high: m.highDetailRoot.isEnabled() })) };
    });
    expect(staged.tag).toBe(tag);
    expect(staged.error).toBeLessThan(0.05);
    expect(staged.angleError).toBeLessThan(0.01);
    expect(staged.locked).toBe(true);
    expect(staged.models).toEqual([{ low: false, high: true }, { low: false, high: true }]);
    await page.keyboard.down("w");
    await page.waitForTimeout(1500);
    await page.keyboard.up("w");
    const heldPosition = await page.evaluate(() => window.capsuleTest.lifecycle.actorRoot.position.asArray());
    // Ground-height resampling can differ in its final floating-point bit.
    heldPosition.forEach((value, index) => expect(value).toBeCloseTo(staged.position[index], 6));
    await page.screenshot({ path: testInfo.outputPath(`${tag}-interacting.png`) });
    if (tag === 'GCH0') await page.evaluate(() => {
      const l = window.capsuleTest.lifecycle;
      const main = l.scene.activeCamera;
      const camera = main.clone('capsule-prop-proof');
      camera.inputs.clear();
      camera.minZ = 0.01;
      l.scene.activeCamera = camera;
      const observer = l.scene.onBeforeRenderObservable.add(() => {
        const active = l.dobuitaInteractionProps.capsules.active;
        if (!active) return;
        const target = active.lid.getAbsolutePosition().add(active.base.getAbsolutePosition()).scale(0.5);
        const Vector3 = target.constructor;
        camera.position.copyFrom(target.add(new Vector3(-0.45, 0.35, -0.12)));
        camera.setTarget(target);
      });
      window.capsuleTest.proofCamera = {main, camera, observer};
    });
    for (const [frame, phase] of [[235, 'tray'], [325, 'held'], [380, 'open']]) {
      await page.waitForFunction(frame => {
        const a = window.capsuleTest.lifecycle.playerRuntime.animation;
        return a.state === 'dobuitaGacha:loop' && a.tick >= frame;
      }, frame);
      const props = await page.evaluate(() => {
        const l = window.capsuleTest.lifecycle;
        const c = l.dobuitaInteractionProps.capsules;
        return {frame: l.playerRuntime.animation.tick, lid: c.active?.lid.isEnabled(), base: c.active?.base.isEnabled(),
          lidPosition: c.active?.lid.getAbsolutePosition().asArray(), basePosition: c.active?.base.getAbsolutePosition().asArray()};
      });
      expect(props.lid).toBe(true);
      expect(props.base).toBe(true);
      await testInfo.attach(`${tag}-${phase}`, {body: JSON.stringify(props, null, 2), contentType: 'application/json'});
      await page.screenshot({ path: testInfo.outputPath(`${tag}-${phase}.png`) });
    }
    if (tag === 'GCH0') await page.evaluate(() => {
      const l = window.capsuleTest.lifecycle, p = window.capsuleTest.proofCamera;
      l.scene.onBeforeRenderObservable.remove(p.observer);
      l.scene.activeCamera = p.main;
      p.camera.dispose();
    });
    await page.waitForFunction(() => window.capsuleTest.lifecycle.interactionManager.inspectables.inspection.session?.active, null, { timeout: 45000 });
    await expect(page.locator('#dialogue-source')).toHaveText('This is cool!');
    await expect(page.getByRole('button', {name: /Close inspection/})).toBeVisible();
    await page.waitForFunction(() => window.capsuleTest.lifecycle.interactionManager.inspectables.inspection.presenter.audio?.currentTime > 0.1);
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(true);
    await page.screenshot({path: testInfo.outputPath(tag + '-inspection.png')});
    const controls = await page.locator('#inspection-controls').boundingBox();
    const dialogue = await page.locator('#dialogue-overlay').boundingBox();
    expect(controls.y + controls.height).toBeLessThan(dialogue.y);
    expect(await page.locator('#dialogue-options button').count()).toBe(0);
    const rotation = () => page.evaluate(() => window.capsuleTest.lifecycle.interactionManager.inspectables
      .inspection.session.rotationPivot.rotationQuaternion.asArray());
    const originalRotation = await rotation();
    await page.keyboard.down('a');
    await page.waitForTimeout(180);
    await page.keyboard.up('a');
    expect(await rotation()).not.toEqual(originalRotation);
    for (const button of ['left', 'right']) {
      const before = await rotation();
      const canvas = await page.locator('#renderCanvas').boundingBox();
      await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.4);
      await page.mouse.down({button});
      await page.mouse.move(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.45, {steps: 5});
      await page.mouse.up({button});
      expect(await rotation()).not.toEqual(before);
    }
    const unmoved = await page.evaluate(() => window.capsuleTest.lifecycle.actorRoot.position.asArray());
    unmoved.forEach((value, index) => expect(value).toBeCloseTo(staged.position[index], 6));
    await page.keyboard.press('x');
    await page.waitForFunction(() => !window.capsuleTest.lifecycle.interactionManager.inspectables.busy);
    const restored = await page.evaluate(() => {
      const c = window.capsuleTest.lifecycle.getController();
      return {yaw: c.cameraYaw, pitch: c.cameraPitch, distance: c.cameraDistance,
        firstPerson: c.firstPerson, mainCamera: c.scene.activeCamera === c.camera};
    });
    expect(restored).toEqual(await page.evaluate(() => window.capsuleTest.beforeView));
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(false);
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.dobuitaInteractionProps.gachaMachines
      .every(m => !m.lowDetailRoot.isEnabled() && m.highDetailRoot.isEnabled()))).toBe(true);
    await page.locator('#collection-button').click();
    const collection = page.getByRole('dialog', {name: 'Collection', exact: true});
    await expect(collection).toBeVisible();
    await expect(collection.getByText(tag === 'GCH0' ? 'NiGHTS 1' : 'Kids Akira 1', {exact: true})).toBeVisible();
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(true);
    const toyName = tag === 'GCH0' ? 'NiGHTS 1' : 'Kids Akira 1';
    const toyCard = collection.getByRole('button', {name: `Inspect ${toyName}`});
    await expect(toyCard.locator('img')).toBeVisible();
    await toyCard.click();
    const toyPopup = page.getByRole('dialog', {name: toyName, exact: true});
    await expect(toyPopup.locator('.collection-toy-stage')).toHaveAttribute('data-status', 'ready');
    await page.keyboard.down('a');
    await page.waitForTimeout(180);
    await page.keyboard.up('a');
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(true);
    await page.keyboard.press('x');
    await expect(toyPopup).toBeHidden();
    await expect(collection).toBeVisible();
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(true);
    const collectionView = await page.evaluate(() => {
      const c = window.capsuleTest.lifecycle.getController();
      return {yaw: c.cameraYaw, pitch: c.cameraPitch, distance: c.cameraDistance,
        firstPerson: c.firstPerson, mainCamera: c.scene.activeCamera === c.camera};
    });
    expect(collectionView).toEqual(restored);
    await page.screenshot({path: testInfo.outputPath(tag + '-collection.png')});
    await page.keyboard.press('Escape');
    await expect(collection).toBeHidden();
    expect(await page.evaluate(() => window.capsuleTest.lifecycle.getController().movementLocked)).toBe(false);
    await testInfo.attach(`${tag}-staging`, { body: JSON.stringify(staged, null, 2), contentType: "application/json" });
  }
  expect(await page.evaluate(() => window.capsuleTest.purchases.map(p => p.machineId)))
    .toEqual(['dobuita-gch0', 'dobuita-gch3']);
  expect(errors).toEqual([]);
});
