import { expect, test } from "@playwright/test";

const entries = Array.from({ length: 30 }, (_, index) => ({
  characterId: index + 1,
  playerName: index === 6 ? "Ryo Hazuki" : `Arcade Player ${index + 1}`,
  score: 30000 - index * 100,
  achievedAt: "2026-09-07T12:00:00Z",
}));

for (const width of [1280, 390]) {
  test(`arcade completion opens scrollable dated results at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    const submissions = [];
    let reads = 0;
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
    await page.route("**/api/status", route => route.fulfill({ json: {} }));
    await page.route("**/api/arcade-scores**", async route => {
      if (route.request().method() === "POST") {
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ json: { machineId: "qte-0", score: 30000, newHighScore: false } });
      }
      if (new URL(route.request().url()).searchParams.has("machineId")) {
        reads++;
        if (width === 390 && reads === 1) return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: { machineId: "qte-0", entries } });
      }
      return route.fulfill({ json: { scores: ["qte-0", "qte-1", "darts-0", "darts-1"].map(machineId => ({ machineId, score: 30000 })) } });
    });
    await page.goto("/play/", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Open the New Yokosuka menu")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" })).toBeEnabled({ timeout: 30_000 });
    await page.evaluate(async () => {
      // Reuse Vite's already-loaded module URL: importing a second Babylon
      // bundle registers engine extensions twice, which is not a game failure.
      const babylonUrl = performance.getEntriesByType("resource").find(entry => entry.name.includes("/.vite/deps/@babylonjs_core.js"))?.name;
      if (!babylonUrl) throw Error("Cannot locate the application's Babylon module");
      const resultsUrl = performance.getEntriesByType("resource").find(entry => new URL(entry.name).pathname === "/play/ui/react/arcadeResultsStore.js")?.name;
      if (!resultsUrl) throw Error("Cannot locate the application's results store");
      const [{ PlayArcadeAssembly }, { ArcadeCoordinator }, { ArcadeCabinetView }, BABYLON, { queryPlayDom }, { PlayUiCoordinator }, results, account] = await Promise.all([
        import("/play/arcade/PlayArcadeAssembly.js"), import("/play/arcade/ArcadeCoordinator.js"),
        import("/play/arcade/ArcadeCabinetView.js"), import(babylonUrl),
        import("/play/ui/dom.js"), import("/play/ui/PlayUiCoordinator.js"),
        import(resultsUrl), import("/play/account/react/accountStore.js"),
      ]);
      account.useAccountStore.setState({ screen: "closed" });
      document.body.classList.remove("account-pending", "account-menu-visible");
      document.documentElement.classList.remove("mobile-sidebar-pending");
      const dom = queryPlayDom();
      const controller = { movementLocked: false, setMovementLocked(value) { this.movementLocked = value; } };
      const ui = new PlayUiCoordinator({
        canvas: dom.canvas, getMovementLocked: () => controller.movementLocked,
        setMovementLocked: value => controller.setMovementLocked(value),
      });
      results.configureArcadeResultsUi({
        onOpen: () => ui.openModal("arcade-results"),
        onClose: () => ui.closeModal("arcade-results"),
        onAfterClose: () => dom.canvas.focus(),
      });
      // Exercise the real game -> coordinator -> HTTP -> React path. Only the
      // 3D cabinet meshes/world are omitted; camera restoration still runs.
      const engine = new BABYLON.NullEngine();
      const scene = new BABYLON.Scene(engine);
      const camera = new BABYLON.FreeCamera("test", new BABYLON.Vector3(0, 2, 6), scene);
      const assembly = Object.create(PlayArcadeAssembly.prototype);
      Object.assign(assembly, {
        dom, games: null, pendingResults: null, getController: () => controller,
        mobileControls: { syncJoystick() {} }, controlsHud: { show() {} }, updateAttractScreens() {},
      });
      assembly.cabinetView = new ArcadeCabinetView({ scene, engine, camera, dom, definitions: {}, updateAttractScreens() {} });
      assembly.coordinator = new ArcadeCoordinator({
        accountSession: { character: { id: 7 } }, dom, getGames: () => assembly.games,
        displays: { updatePaddleScores() {}, updateDartScores() {} },
      });
      const games = assembly.initializeGames();
      games.requestFrame = () => 0;
      games.cancelFrame = () => {};
      games.start("qte");
      games.press("Enter");
      games.press("Enter");
      games.state.score = 1234;
      games.state.lives = 1;
      games.state.promptLeft = 0;
      // Install a real exiting camera transition so results cannot open early.
      assembly.cabinetView.setActive(true, games.game, { center: [0, 0, 0], frontNormal: [0, 0, 1], up: [0, 1, 0], cameraDistance: 1 });
      games.frame(performance.now() + 50); // Last missed prompt ends the round.
      assembly.updateResults();
      if (results.useArcadeResultsStore.getState().open) throw Error("Opened before camera restoration");
      assembly.cabinetView.transition.startedAt -= 500;
      assembly.cabinetView.updateTransition(() => controller.setMovementLocked(false));
      assembly.updateResults();
      assembly.updateResults(); // Must not open/submit a second time.
      window.__arcadeResultTest = { controller, assembly, engine, scene };
    });
    const modal = page.getByRole("dialog", { name: "Excite QTE — High Scores" });
    await expect(modal).toBeVisible();
    if (width === 390) {
      await expect(modal.getByText("High scores couldn’t be loaded.")).toBeVisible();
      await modal.getByRole("button", { name: "Retry" }).click();
    }
    await expect(modal.locator("tbody tr")).toHaveCount(30);
    await expect(modal.getByText("Your score: 1,234")).toBeVisible();
    await expect(modal.getByText("You", { exact: true })).toBeVisible();
    await expect(modal.locator("time").first()).toHaveAttribute("datetime", entries[0].achievedAt);
    expect(submissions).toEqual([{ machineId: "qte-0", characterId: 7, score: 1234 }]);
    expect(await page.evaluate(() => window.__arcadeResultTest.controller.movementLocked)).toBe(true);
    const viewport = modal.locator("[data-radix-scroll-area-viewport]").first();
    const bounds = await viewport.evaluate(element => ({ height: element.clientHeight, total: element.scrollHeight, width: element.clientWidth, contentWidth: element.scrollWidth }));
    expect(bounds.total).toBeGreaterThan(bounds.height);
    expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.width + 1);
    await page.screenshot({ path: testInfo.outputPath("high-scores.png") });
    await viewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(modal.locator("tbody tr").last()).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("high-scores-scrolled.png") });
    await modal.getByRole("button", { name: "Close high scores" }).click();
    await expect(modal).toBeHidden();
    expect(await page.evaluate(() => window.__arcadeResultTest.controller.movementLocked)).toBe(false);
    await expect(page.locator("#renderCanvas")).toBeFocused();
  });
}
