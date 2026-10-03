import {test, expect} from '@playwright/test';

test('Fortune’s Pier facade overlays remain stable in original and prepared scenery', async ({page}, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_S2_OVERLAYS !== 'true', 'Requires extracted S2 scenery');
  test.setTimeout(180_000);
  await page.setViewportSize({width: 1100, height: 760});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/status', route => route.fulfill({json: {}}));
  await page.route('**/play/play.js*', route => route.fulfill({contentType: 'application/javascript', body: `
    import {PlaySceneRuntime} from '/play/PlaySceneRuntime.js';
    import {WorldLoader} from '/play/world/WorldLoader.js';
    import {PreparedSceneryRuntime} from '/play/world/PreparedSceneryRuntime.js';
    import {WorldMapLayerState} from '/src/rendering/WorldMapLayerState.js';
    import {graphicsPreferences} from '/src/rendering/GraphicsPreferences.js';
    import {updateControllerCamera} from '/src/ThirdPersonCamera.js';
    import {DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS} from '/src/ThirdPersonController.js';
    import {applyTimeOfDay} from '/src/lighting.js';
    import {WORLDS} from '/play/config/worlds.js';
    import state from '/src/state.js';
    const runtime = new PlaySceneRuntime({dom: {canvas: document.getElementById('renderCanvas')}, graphicsPreferences});
    runtime.disposeMenuBackground(); runtime.engine.stopRenderLoop();
    const loader = new WorldLoader({scene: runtime.scene, state,
      placementRuntime: {load: async () => {}}, scheduledActors: {load: async () => {}}});
    document.body.append(state.canvas); document.body.className = '';
    document.querySelectorAll('body > *').forEach(node => {if (!node.contains(state.canvas)) node.style.display = 'none';});
    state.canvas.style.cssText = 'position:fixed;inset:0;width:1100px;height:760px;z-index:999999;display:block';
    state.engine.setSize(1100, 760);
    window.overlayCheck = {
      async load(prepared) {
        loader.preparedScenery = prepared ? new PreparedSceneryRuntime(state) : null;
        await loader.load({world: WORLDS.s2ak00, scheduledActorDefinitions: []});
        for (const root of state.currentMeshes) root._worldMt7MapEffectRuntime?.dispose();
        state.isInteriorScene = false; state.currentTimeOfDay = 0; applyTimeOfDay(0);
        new WorldMapLayerState().load(WORLDS.s2ak00, state.currentMeshes, new Date(Date.UTC(1986, 10, 29, 10)));
        runtime.actorRoot.position.set(-243.34, 100, 253.66);
        await state.scene.whenReadyAsync();
        return {prepared: Boolean(state.preparedSceneryResources),
          biased: state.scene.meshes.filter(mesh => mesh.material?.zOffset < 0).length};
      },
      async frame(yaw, pitch, bias, crop) {
        updateControllerCamera({actorRoot: runtime.actorRoot, camera: runtime.camera,
          options: DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS, firstPerson: true,
          cameraTarget: runtime.camera.position.clone(), cameraYaw: yaw, cameraPitch: pitch}, 1);
        for (const material of state.scene.materials) {
          material._testBias ??= [material.zOffset, material.zOffsetUnits];
          [material.zOffset, material.zOffsetUnits] = material._testBias.map(value => value * Number(bias));
        }
        state.scene.render();
        if (crop) {
          const sample = document.createElement('canvas'); sample.width = crop[2]; sample.height = crop[3];
          const ctx = sample.getContext('2d');
          ctx.drawImage(state.canvas, ...crop, 0, 0, crop[2], crop[3]);
          return [...ctx.getImageData(0, 0, crop[2], crop[3]).data];
        }
      },
    };
  `}));
  await page.goto('/play/');
  await page.waitForFunction(() => window.overlayCheck);
  const report = [];
  for (const prepared of [false, true]) {
    const result = await page.evaluate(prepared => window.overlayCheck.load(prepared), prepared);
    expect(result.prepared).toBe(prepared);
    report.push(result);
    expect(result.biased).toBeGreaterThan(0);
    for (const [name, yaw, pitch] of [['ivy', 1.426458, 0.094167], ['doors', -0.129958, 0.032417]]) {
      for (const bias of [false, true]) for (const offset of [0, 0.012]) {
        await page.evaluate(({yaw, pitch, bias}) => window.overlayCheck.frame(yaw, pitch, bias), {yaw: yaw + offset, pitch, bias});
        await page.screenshot({path: testInfo.outputPath(name + '-' + (prepared ? 'prepared' : 'original') + '-' + (bias ? 'fixed' : 'unbiased') + '-' + offset + '.png')});
      }
      const crop = name === 'ivy' ? [235, 90, 240, 110] : [315, 185, 235, 245];
      const changed = [];
      // Tiny pans should move edges by less than a pixel, not replace whole
      // patches of ivy/windows with their coplanar backing surfaces.
      for (const bias of [false, true]) {
        const frames = [];
        for (const offset of [0, 0.00001, 0.00002, 0.00003]) frames.push(await page.evaluate(
          args => window.overlayCheck.frame(...args), [yaw + offset, pitch, bias, crop]));
        let unstable = 0;
        for (let p = 0; p < frames[0].length; p += 4) {
          if (frames.slice(1).some(frame => [0, 1, 2].some(channel => Math.abs(frame[p + channel] - frames[0][p + channel]) > 25))) {
            unstable++;
          }
        }
        changed.push(unstable);
      }
      const [unbiased, fixed] = changed;
      report.push({prepared, name, unbiased, fixed});
      expect(fixed, name + ': remaining variation is limited to texture edges').toBeLessThan(crop[2] * crop[3] * 0.005);
      if (name === 'ivy') {
        expect(unbiased, 'the control must reproduce the reported shimmer').toBeGreaterThan(500);
        expect(fixed, 'layer ordering removes at least 90% of the shimmer').toBeLessThan(unbiased * 0.1);
      }
    }
  }
  await testInfo.attach('overlay-materials', {body: JSON.stringify(report), contentType: 'application/json'});
  expect(errors).toEqual([]);
});
