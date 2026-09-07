import { expect, test } from "@playwright/test";

test("application starts once after prior user input and disposes its runtime", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      errors.push(message.text());
    }
  });
  // Control only the entrypoint and server status; use the real browser runtime,
  // UI, WebGL scene, and preferences. No account or game server is needed here.
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/play/play.js*", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      import { PlayApplication } from "/play/PlayApplication.js";
      import state from "/src/state.js";
      import { accountSession } from "/play/account/AccountSession.js";
      import { InputActionSystem } from "/play/input/InputActions.js";
      const setButton = InputActionSystem.prototype.setButton;
      window.keyboardEvents = [];
      InputActionSystem.prototype.setButton = function(device, code, held) {
        if (device === 'keyboard') window.keyboardEvents.push({ code, held });
        return setButton.call(this, device, code, held);
      };
      window.lifecycleTest = {
        application: new PlayApplication(), state, accountSession, errors: [],
      };
    `,
  }));
  await page.goto("/play/");
  await page.waitForFunction(() => Boolean(window.lifecycleTest));
  expect(await page.evaluate(() => window.lifecycleTest.application.runtime)).toBeNull();

  // This used to trigger a synchronous activation callback before the audio
  // assembly had assigned its unsubscribe function.
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => {
    const { application, errors } = window.lifecycleTest;
    const first = application.start();
    first.catch(error => errors.push(error.message));
    return first === application.start();
  })).toBe(true);
  await expect(page.locator(".account-entry-actions button").filter({
    hasText: "Quick Play",
  })).toBeEnabled({ timeout: 30_000 });
  expect(await page.evaluate(() => window.lifecycleTest.errors)).toEqual([]);
  await page.evaluate(async () => {
    const { useAccountStore } = await import('/play/account/react/accountStore.js');
    useAccountStore.setState({ screen: 'closed' });
  });
  await expect(page.locator('body')).not.toHaveClass(/account-menu-visible/);
  await page.locator('#renderCanvas').focus();
  await page.keyboard.press('KeyW');
  expect(await page.evaluate(() => window.keyboardEvents)).toEqual(
    expect.arrayContaining([{ code: 'KeyW', held: true }, { code: 'KeyW', held: false }]),
  );

  expect(await page.evaluate(async () => {
    const { application, state, accountSession } = window.lifecycleTest;
    application.dispose();
    application.dispose();
    let restartRejected = false;
    try { await application.start(); } catch { restartRejected = true; }
    return {
      restartRejected,
      polling: accountSession.connectionStatus.running,
      scenes: state.engine.scenes.length,
    };
  })).toEqual({ restartRejected: true, polling: false, scenes: 0 });
  expect(errors).toEqual([]);
});
