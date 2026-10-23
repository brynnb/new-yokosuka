import { expect, test } from "@playwright/test";

// Render the actual /play DOM, stylesheet and QTE presenter without loading a
// world or creating a character. This proves UI/input, not scene choreography.
for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`Story QTE stays compact at ${viewport.width}px and restores dialogue`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.route("**/play/ui/react/main.jsx*", route => route.fulfill({ contentType: "text/javascript", body: "" }));
    await page.route("**/play/play.js*", route => route.fulfill({ contentType: "text/javascript", body: `
      import { ScriptEventDialoguePresenter } from '/play/scripts/ScriptEventDialoguePresenter.js';
      document.body.classList.remove('account-pending');
      document.documentElement.classList.remove('mobile-sidebar-pending');
      document.getElementById('account-ui-root').remove();
      document.getElementById('loading').remove();
      const node = id => document.getElementById(id);
      window.qteResults = [];
      window.qtePresenter = new ScriptEventDialoguePresenter({
        root: node('dialogue-overlay'), speaker: node('dialogue-speaker'),
        sourceText: node('dialogue-source'), japaneseText: node('dialogue-japanese'), options: node('dialogue-options'),
        onChallengeResponse: (...args) => window.qteResults.push(args),
      });
    ` }));
    await page.goto("/play/");
    await page.waitForFunction(() => window.qtePresenter);
    const start = token => page.evaluate(token => window.qtePresenter.showChallenge({
      id: "s1.heartbeats.alley", label: "Defend yourself", token: token.repeat(32), ready: true,
    }), token);
    const buttons = page.locator("#dialogue-options button:visible");
    await start("a");
    await expect(buttons).toHaveText(["B · Shift"]);
    const bounds = await page.locator(".dialogue-overlay .dialogue-panel").boundingBox();
    expect(bounds.height).toBeLessThan(200);
    expect(bounds.width).toBeLessThanOrEqual(420);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath("qte-prompt.png") });
    // Pointer input uses the same runtime as keys, without a menu of decoys.
    await buttons.click();
    await expect(buttons).toHaveText(["A · Enter"]);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.qteResults.at(-1))).toEqual(["challenge_result", "a".repeat(32), "success"]);
    await start("b");
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => window.qteResults.at(-1))).toEqual(["challenge_result", "b".repeat(32), "failure"]);
    await start("c");
    await page.clock.runFor(2001);
    expect(await page.evaluate(() => window.qteResults.at(-1))).toEqual(["challenge_result", "c".repeat(32), "failure"]);
    await page.evaluate(() => {
      window.qtePresenter.hide();
      window.qtePresenter.show({ text: "Ryo: Back to the conversation.", metadata: ["speaker:AKIR"] });
    });
    await expect(page.locator("#dialogue-overlay")).toHaveAttribute("data-presentation", "dialogue");
    await expect(buttons).toHaveCount(0);
    await expect(page.locator("#dialogue-source")).toHaveText("Back to the conversation.");
  });
}
