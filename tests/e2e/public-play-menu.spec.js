import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`public menu and sidebar layout at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.route("**/api/status", route => route.fulfill({ json: {} }));
    await page.goto("/play/", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Open the New Yokosuka menu")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" })).toBeVisible();
    const quickPlay = page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" });
    await expect(quickPlay).toHaveCSS("background-color", "rgb(103, 217, 232)");
    await quickPlay.hover();
    await expect(quickPlay).toHaveCSS("background-color", "rgb(140, 229, 240)");
    await page.mouse.move(0, 0);
    await quickPlay.focus();
    await expect(quickPlay).toHaveCSS("background-color", "rgb(140, 229, 240)");
    await page.screenshot({ path: testInfo.outputPath("account-primary-button.png") });
    await expect(page.locator(".account-entry-actions button").filter({ hasText: "Cutscenes" })).toHaveCount(0);
    await expect(page.locator("#cutscene-button")).toHaveCount(0);

    // Isolate the real sidebar without creating an account or entering a world.
    // This checks production CSS as well as dev CSS when E2E_APP_URL is a preview.
    await page.evaluate(() => {
      document.getElementById("account-ui-root").hidden = true;
      document.body.classList.remove("account-pending", "account-menu-visible");
      document.documentElement.classList.remove("mobile-sidebar-pending");
      document.querySelector(".app").classList.remove("sidebar-collapsed");
    });
    const layout = await page.evaluate(() => {
      const tools = document.querySelector(".sidebar-game-tools");
      const header = document.querySelector(".sidebar-header").getBoundingClientRect();
      const outer = tools.getBoundingClientRect();
      const cards = [...tools.children].map(e => e.getBoundingClientRect());
      return {
        display: getComputedStyle(tools).display,
        gapAbove: cards[0].top - header.bottom,
        gutters: cards.map(r => ({ left: r.left - outer.left, right: outer.right - r.right })),
      };
    });
    expect(layout.display).toBe("flex");
    expect(layout.gapAbove).toBeGreaterThanOrEqual(12);
    for (const gutters of layout.gutters) {
      expect(gutters.left).toBeGreaterThanOrEqual(12);
      expect(Math.abs(gutters.left - gutters.right)).toBeLessThan(1);
    }
    await expect(page.locator("#travel-button")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("sidebar.png") });
  });
}
