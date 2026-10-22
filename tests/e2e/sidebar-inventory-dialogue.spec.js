import { expect, test } from "@playwright/test";

test("intro menu, transparent inventory and Space dialogue completion", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.menuDialogueTest = { ready: false, errors: [], cutscenes: [], voices: [], advances: [] };
  });
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [{
    id: 42, name: "Menutester", avatarId: "ryo", worldId: "exterior",
    // The authored Hazuki arrival in play/config/locations.js, not the
    // origin inside the house (which cannot prove normal ground movement).
    x: -6.48, y: 0, z: -19.32, yaw: 0,
    lastLoginAt: "2026-01-01T00:00:00Z",
  }] } }));
  // The inventory UI now renders server possessions, not all available art.
  await page.route("**/api/characters/42/state",route=>route.fulfill({json:{inventory:[
    {key:'chinese_letter',name:'Chinese Letter',category:'key_item',quantity:1},
    {key:'sword_handguard',name:'Sword Handguard',category:'key_item',quantity:1},
  ]}}));
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument("play/world/PlayWorldLifecycle.js", `
    const menuInitialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(options) {
      window.menuDialogueTest.lifecycle = this;
      return menuInitialize.call(this, options);
    };
  `);
  await instrument("play/interactions/PlayInteractionAssembly.js", `
    const menuDispatcher = PlayInteractionAssembly.prototype.createDispatcher;
    PlayInteractionAssembly.prototype.createDispatcher = function(...args) {
      const result = menuDispatcher.apply(this, args);
      window.menuDialogueTest.interactions = this.scripted;
      return result;
    };
  `);
  await instrument("play/scripts/ScriptEventDialoguePresenter.js", `
    const menuShow = ScriptEventDialoguePresenter.prototype.show;
    ScriptEventDialoguePresenter.prototype.show = function(...args) {
      this.voiceManifest = { urlFor: () => new Promise(resolve => window.menuDialogueTest.voices.push(resolve)) };
      return menuShow.apply(this, args);
    };
  `);
  await instrument("play/cutscenes/CutscenePreviewRuntime.js", `
    CutscenePreviewRuntime.prototype.requestInGame = async function(id) {
      window.menuDialogueTest.cutscenes.push(id);
    };
  `);
  await instrument("play/multiplayer/MultiplayerSession.js", `
    MultiplayerSession.prototype.connect = function() {
      const client = this.client;
      client.startScriptEvent = (selector, requestId) => {
        queueMicrotask(() => client.callbacks.onScriptEventYield({ requestId, runId: 1,
          event: { type: 'line', sequence: 1 },
          line: { text: 'Fuku-san: Ryo-san!', metadata: ['speaker:FUKU', 'voice:FUKU_TEST'] },
        }));
        return true;
      };
      client.advanceScriptEvent = (runId, action, options) => {
        window.menuDialogueTest.advances.push(action);
        queueMicrotask(() => client.callbacks.onScriptEventYield({ requestId: options.requestId, runId,
          event: { type: 'complete', sequence: 2 },
        }));
        return true;
      };
    };
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.menuDialogueTest;
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
  await page.waitForFunction(() => window.menuDialogueTest.ready || window.menuDialogueTest.errors.length, null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.menuDialogueTest.errors)).toEqual([]);
  await expect(page.locator("#loading")).toHaveClass(/hidden/);
  // This fake transport omits Welcome, which normally hydrates the native save
  // before an owned server event. Supply the canonical neutral fixture through
  // the real runtime boundary; do not bypass its missing-save guard.
  await page.evaluate(async()=>{
    const {createNativeDialogueSnapshot}=await import('/play/dialogue/NativeDialogueSnapshot.js');
    window.menuDialogueTest.lifecycle.nativeStoryRuntime.applyDialogueState(createNativeDialogueSnapshot().toJSON());
  });

  await expect(page.locator("#travel-button")).toHaveText("Travel to...");
  await expect(page.locator("#animation-button")).toHaveText("Select emote...");
  const names = ["Opening Vision — Shenhua and the Hawk", "Introduction — Iwao's Murder",
    "Introduction — Ine-san Collects the Mail", "Introduction — Lan Di Dream and Awakening"];
  for (const name of names) {
    await page.locator("#cutscene-button").click();
    await expect(page.getByRole("option")).toHaveText(names);
    await page.getByRole("option", { name, exact: true }).click();
  }
  expect(await page.evaluate(() => window.menuDialogueTest.cutscenes)).toEqual([
    "S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM",
  ]);

  await page.locator("#inventory-button").click();
  await expect(page.locator(".inventory-slot")).toHaveCount(2);
  const pixels = await page.locator(".inventory-slot-icon").first().evaluate(async element => {
    const image = element;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 128, 128);
    const data = context.getImageData(0, 0, 128, 128).data;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
    // Radix paints Card surfaces on ::before, not on the Card element itself.
    return { transparent, slotBackground: getComputedStyle(element.parentElement, "::before").backgroundColor };
  });
  expect(pixels.transparent).toBeGreaterThan(0);
  expect(pixels.transparent).toBeLessThan(128 * 128);
  expect(pixels.slotBackground).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath("inventory-grey-slots.png") });
  await page.getByRole("button", { name: "Close inventory" }).click();

  // Real Fuku-san model, interaction gate, presentation ownership, keyboard
  // handler and movement. The fake transport supplies no NPC snapshot, so
  // explicitly prepare his model; this does not test scheduling or proximity.
  const actor = await page.evaluate(async () => {
    const scheduled = window.menuDialogueTest.lifecycle.scheduledActors;
    await scheduled.prepareActivityActors(["FUKU"]);
    const entry = scheduled.entries.find(entry => entry.definition.actorCode === "FUKU"
      && (entry.defaultModel || entry.models?.size));
    const actor = entry && scheduled.dialogueActor("FUKU", entry.definition.instanceId || "FUKU");
    return actor && { actorCode: actor.actorCode, id: actor.instanceId };
  });
  expect(actor).toBeTruthy();
  await page.evaluate(actor => window.menuDialogueTest.interactions.startNpc(actor), actor);
  await expect(page.locator("#dialogue-overlay")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.menuDialogueTest.voices.length)).toBe(1);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.menuDialogueTest.interactions.scriptEventController.status)).toBe("idle");
  await expect(page.locator("body")).not.toHaveClass(/dialogue-active/);
  expect(await page.evaluate(() => window.menuDialogueTest.lifecycle.getController().movementLocked)).toBe(false);
  const before = await page.evaluate(() => window.menuDialogueTest.lifecycle.getController().collider.position.asArray());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => window.menuDialogueTest.lifecycle.getController().collider.position.asArray());
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.1);
  await page.evaluate(() => window.menuDialogueTest.voices.forEach(resolve => resolve(null)));
  expect(await page.evaluate(() => window.menuDialogueTest.advances)).toEqual(["continue"]);
  await page.screenshot({ path: testInfo.outputPath("fuku-dialogue-finished.png") });
  expect(errors).toEqual([]);
});
