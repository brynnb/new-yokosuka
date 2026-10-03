import {test, expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";

// Matched real GPU frames, one scene at a time. The gameplay smoke test covers
// actors/travel; this keeps cameras, time and effect clocks identical so a
// material, texture-array, transform or layer regression cannot hide in noise.
test("prepared S2 scenery matches the original renderer across discs and time layers", async ({page}, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_PREPARED_SCENERY !== "true", "Requires local prepared scenery");
  test.setTimeout(480_000);
  await page.setViewportSize({width: 900, height: 700});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/status", route => route.fulfill({json: {}}));
  await page.route("**/play/play.js*", route => route.fulfill({contentType: "application/javascript", body: `
    import {PlaySceneRuntime} from '/play/PlaySceneRuntime.js';
    import {WorldLoader} from '/play/world/WorldLoader.js';
    import {PreparedSceneryRuntime} from '/play/world/PreparedSceneryRuntime.js';
    import {WorldMapLayerState} from '/src/rendering/WorldMapLayerState.js';
    import {graphicsPreferences} from '/src/rendering/GraphicsPreferences.js';
    import {applyTimeOfDay} from '/src/lighting.js';
    import {WORLDS} from '/play/config/worlds.js';
    import state from '/src/state.js';
    const runtime = new PlaySceneRuntime({dom: {canvas: document.getElementById('renderCanvas')}, graphicsPreferences});
    runtime.disposeMenuBackground();
    runtime.engine.stopRenderLoop();
    const loader = new WorldLoader({scene: runtime.scene, state,
      placementRuntime: {load: async () => {}}, scheduledActors: {load: async () => {}}});
    document.body.append(state.canvas);
    document.body.className = '';
    document.querySelectorAll('body > *').forEach(node => {
      if (!node.contains(state.canvas)) node.style.display = 'none';
    });
    state.canvas.style.cssText = 'position:fixed;inset:0;width:900px;height:700px;z-index:999999;display:block';
    state.engine.setSize(900, 700);
    window.sceneryComparison = {
      async load(id, prepared) {
        const world = WORLDS[id];
        loader.preparedScenery = prepared ? new PreparedSceneryRuntime(state) : null;
        await loader.load({world, scheduledActorDefinitions: []});
        for (const root of state.currentMeshes) root._worldMt7MapEffectRuntime?.dispose();
        const camera = runtime.camera;
        camera.position.copyFrom(world.spawn); camera.position.y += 1.65;
        camera.rotation.set(0, world.yaw, 0);
        camera.fov = 0.9;
        return Boolean(state.preparedSceneryResources);
      },
      async frame(id, time, turn) {
        const world = WORLDS[id];
        state.isInteriorScene = Boolean(world.interior);
        state.currentTimeOfDay = time;
        applyTimeOfDay(time);
        new WorldMapLayerState().load(world, state.currentMeshes, new Date(Date.UTC(1986, 10, 29, time === 0 ? 10 : 19)));
        for (const root of state.currentMeshes) root._worldMt7MapEffectRuntime?.update(2);
        runtime.camera.rotation.y = world.yaw + turn;
        await state.scene.whenReadyAsync();
        state.scene.render();
        const sample = document.createElement('canvas'); sample.width = sample.height = 64;
        const ctx = sample.getContext('2d');
        ctx.drawImage(state.canvas, 0, 0, 64, 64);
        return [...ctx.getImageData(0, 0, 64, 64).data];
      },
    };
  `}));
  await page.goto("/play/");
  await page.waitForFunction(() => window.sceneryComparison);
  await expect(page.locator('#renderCanvas')).toHaveCSS('opacity', '1');
  const results = [];
  for (const id of ["s2ara0", "s2ar02", "s2we00", "s2d2ara0", "s2d3q100", "s2d4qgbt", "s2d4ksh1"]) {
    const samples = [];
    const poses = [{time: 0, turn: 0}, {time: 0, turn: Math.PI}, {time: 2, turn: Math.PI / 2}];
    for (const prepared of [false, true]) {
      expect(await page.evaluate(({id, prepared}) => window.sceneryComparison.load(id, prepared), {id, prepared})).toBe(prepared);
      const frames = [];
      for (const [index, pose] of poses.entries()) {
        frames.push(await page.evaluate(({id, time, turn}) => window.sceneryComparison.frame(id, time, turn), {id, ...pose}));
        await page.screenshot({path: testInfo.outputPath(`${id}-${prepared ? "prepared" : "original"}-${index}.png`)});
      }
      samples.push(frames);
    }
    for (const [index, pixels] of samples[0].entries()) {
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(pixels.slice(i, i + 3).join(','));
      expect(colors.size, `${id}: actual textured scenery`).toBeGreaterThan(40);
      const difference = pixels.reduce((sum, value, i) => sum + Math.abs(value - samples[1][index][i]), 0) / pixels.length;
      results.push({id, ...poses[index], difference});
      expect(difference, `${id}: matched original/prepared pixels, view ${index}`).toBeLessThan(3);
    }
  }
  await testInfo.attach("render-comparison", {body: JSON.stringify(results, null, 2), contentType: "application/json"});
  await writeFile(testInfo.outputPath('render-comparison.json'), JSON.stringify(results, null, 2));
  expect(errors).toEqual([]);
});
