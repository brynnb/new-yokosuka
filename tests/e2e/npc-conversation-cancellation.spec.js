import { expect, test } from "@playwright/test";

test("closing a Dobuita conversation during voice loading permits the next NPC", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3"));
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [{
    id: 42, name: "Canceltester", avatarId: "ryo", worldId: "dobuita",
    lastLoginAt: "1986-12-03T08:55:00Z",
  }] } }));
  // The real application, world, interaction gate, dialogue DOM and X binding
  // run unchanged. Only account data, the server transport and voice latency
  // are controlled. Select NPCs through the same runtime the canvas picker uses.
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    import { PlayInteractionAssembly } from '/play/interactions/PlayInteractionAssembly.js';
    import { MultiplayerSession } from '/play/multiplayer/MultiplayerSession.js';
    import { ScriptEventDialoguePresenter } from '/play/scripts/ScriptEventDialoguePresenter.js';
    import { PlayWorldLifecycle } from '/play/world/PlayWorldLifecycle.js';
    const probe = window.conversationTest = { ready: false, errors: [], starts: [], cancels: [], voices: [], runId: 0 };
    const createDispatcher = PlayInteractionAssembly.prototype.createDispatcher;
    PlayInteractionAssembly.prototype.createDispatcher = function(...args) {
      const result = createDispatcher.apply(this, args);
      probe.interactions = this.scripted;
      probe.controller = this.scripted.scriptEventController;
      return result;
    };
    const show = ScriptEventDialoguePresenter.prototype.show;
    const initialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(...args) {
      probe.lifecycle = this;
      return initialize.apply(this, args);
    };
    ScriptEventDialoguePresenter.prototype.show = function(...args) {
      this.voiceManifest = { urlFor: () => new Promise(resolve => probe.voices.push(resolve)) };
      probe.presenter = this;
      return show.apply(this, args);
    };
    MultiplayerSession.prototype.connect = function() {
      const client = this.client;
      client.startScriptEvent = (selector, requestId) => {
        probe.starts.push(selector.actor);
        const runId = ++probe.runId;
        queueMicrotask(() => client.callbacks.onScriptEventYield({ requestId, runId,
          event: { type: 'line', sequence: 1 },
          line: { text: 'Ryo: Conversation ' + runId, metadata: ['speaker:AKIR', 'voice:AKIR_TEST'] },
        }));
        return true;
      };
      client.advanceScriptEvent = (runId, action, options) => {
        if (action !== 'cancel') throw new Error('Unexpected fixture action ' + action);
        probe.cancels.push(runId);
        queueMicrotask(() => client.callbacks.onScriptEventYield({ requestId: options.requestId, runId,
          event: { type: 'cancelled', sequence: 2 },
        }));
        return true;
      };
    };
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message);
      for (const failure of error.errors || []) probe.errors.push(failure.stack || String(failure));
      probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button").filter({ hasText: "Canceltester" }).click();
  await page.locator(".account-footer-actions button").filter({ hasText: "Enter World" }).click();
  await page.waitForFunction(() => window.conversationTest.ready || window.conversationTest.errors.length,
    null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.conversationTest.errors)).toEqual([]);
  await expect(page.locator("#loading")).toHaveClass(/hidden/);
  expect(await page.evaluate(() => ({ canStart: window.conversationTest.interactions.canStart(),
    world: window.conversationTest.interactions.getWorld().id,
    owned: window.conversationTest.interactions.getPresentationOwned(),
    status: window.conversationTest.controller.status }))).toMatchObject({ canStart: true, world: "dobuita", status: "idle" });
  const actors = await page.evaluate(() => {
    const scheduled = window.conversationTest.lifecycle.scheduledActors;
    return [...new Map(scheduled.entries.map(entry => {
      const code = entry.definition.actorCode;
      const actor = scheduled.dialogueActor(code, entry.definition.instanceId || code);
      return [code, actor && { actorCode: actor.actorCode, id: actor.instanceId }];
    }).filter(([, actor]) => actor)).values()].slice(0, 2);
  });
  expect(actors).toHaveLength(2);
  for (const [index, actor] of [actors[0], actors[1], actors[0]].entries()) {
    await page.evaluate(actor => window.conversationTest.interactions.startNpc(actor), actor);
    expect(await page.evaluate(() => window.conversationTest.starts)).toHaveLength(index + 1);
    await expect.poll(() => page.evaluate(() => window.conversationTest.presenter?.active)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.conversationTest.voices.length)).toBe(index + 1);
    await page.screenshot({ path: testInfo.outputPath(`conversation-${index}.png`) });
    // No voice resolves until after the next NPC has started. This reproduces
    // the ordered-reply deadlock instead of merely closing a settled line.
    await page.keyboard.press("KeyX");
    await expect.poll(() => page.evaluate(() => window.conversationTest.controller.status)).toBe("idle");
    expect(await page.evaluate(() => window.conversationTest.presenter.active)).toBe(false);
  }
  await page.evaluate(async () => {
    for (const resolve of window.conversationTest.voices) resolve(null);
    await window.conversationTest.controller.processing;
  });
  expect(await page.evaluate(() => ({ starts: window.conversationTest.starts,
    cancels: window.conversationTest.cancels, status: window.conversationTest.controller.status,
    active: window.conversationTest.presenter.active }))).toEqual({
    starts: [actors[0].actorCode, actors[1].actorCode, actors[0].actorCode], cancels: [1, 2, 3], status: "idle", active: false,
  });
  await expect(page.getByText("Finish the current conversation first.", { exact: true })).not.toBeVisible();
  expect(errors).toEqual([]);
});
