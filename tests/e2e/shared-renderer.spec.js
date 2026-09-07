import {test, expect} from "@playwright/test";

// Drive the actual viewer adapter and PlaySceneRuntime/WorldLoader under their
// respective documents. Gameplay services are inert so no account is created.
test("matched S1 and S2 scenes render through both consumers of the shared core", async ({browser}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({viewport: {width: 900, height: 700}});
  const viewer = await context.newPage();
  const play = await context.newPage();
  const errors = [];
  for (const page of [viewer, play]) page.on("pageerror", error => errors.push(error.message));
  await play.route("**/play/play.js*", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      import {PlaySceneRuntime} from "/play/PlaySceneRuntime.js";
      import {WorldLoader} from "/play/world/WorldLoader.js";
      import {graphicsPreferences} from "/src/rendering/GraphicsPreferences.js";
      import state from "/src/state.js";
      const runtime = new PlaySceneRuntime({
        dom: {canvas: document.getElementById("renderCanvas")}, graphicsPreferences,
      });
      runtime.disposeMenuBackground();
      const worldLoader = new WorldLoader({
        scene: runtime.scene, state,
        placementRuntime: {load: async () => {}},
        scheduledActors: {load: async () => {}},
      });
      runtime.engine.runRenderLoop(() => runtime.scene.render());
      window.renderFixture = {runtime, worldLoader};
    `,
  }));
  await play.route("**/api/status", route => route.fulfill({json: {}}));
  await play.goto("/play/", {waitUntil: "domcontentloaded"});
  await play.waitForFunction(() => window.renderFixture);
  await viewer.goto("/asset-viewer/?mode=shenmue2", {waitUntil: "domcontentloaded"});
  await expect(viewer.locator("#model-list > details")).toHaveCount(4, {timeout:60_000});
  for (const kind of ["mt5", "mt7"]) {
    // A common resident map and exact S2 MAPM/PROP catalog selection keep
    // content differences out of this renderer comparison.
    const manifest = await viewer.evaluate(async kind => {
      const {default: state} = await import("/src/state.js");
      const assets = await import("/src/assetLoader.js");
      const catalog = await import("/src/catalog.js");
      state.currentTimeOfDay = 0;
      if (kind === "mt5") {
        state.currentGame = "shenmue";
        state.allFiles = await (await assets.fetchAsset("models.json")).json();
        await catalog.loadScene("S1_DURN", {filenames: new Set(["S1_DURN_MAP.MT5"])});
        return {id:"durn", nativeArea:"DURN", prefix:"S1_DURN", interior:true};
      }
      state.currentGame = "shenmue2";
      const data = await assets.fetchShenmue2Catalog();
      const {shenmue2WorldSceneRecords} = await import("/play/world/Shenmue2SceneRecords.js");
      const world = {id:"s2ara0", assetArea:"ARA0", prefix:"S2DC_D2_ARA0_MPK00", assetFormat:"MT7", interior:true};
      await catalog.loadShenmue2Group(shenmue2WorldSceneRecords(data, world), "Bar Swing");
      const {findInteriorViewpoint} = await import("/src/AssetViewerInteriorCamera.js");
      const entrance = findInteriorViewpoint(state.currentMeshes, data.entryPoints["2/02/ARA0"]);
      if (!entrance) throw new Error("Bar Swing fixture has no validated interior viewpoint");
      return {...world, comparisonPose: {position:entrance.position.asArray(), target:entrance.target.asArray()}};
    }, kind);
    await play.evaluate(async ({kind, manifest}) => {
      const {worldLoader} = window.renderFixture;
      const {default: state} = await import("/src/state.js");
      state.currentTimeOfDay = 0;
      if (kind === "mt7") {
        await worldLoader.loadShenmue2Scene({world:manifest, additionalProgressTotal:0, onProgress:()=>{}});
      } else {
        await worldLoader.load({scheduledActorDefinitions: [], world:{...manifest, placements:[],
          includeFile: filename => filename === "S1_DURN_MAP.MT5"}});
      }
    }, {kind, manifest});
    const pose = manifest.comparisonPose || await viewer.evaluate(async () => {
      const {default: state} = await import("/src/state.js");
      const camera = state.scene.activeCamera;
      camera.getViewMatrix(true);
      return {position:camera.position.asArray(), target:camera.target.asArray()};
    });
    const snapshots = [];
    for (const [name, page] of [["viewer", viewer], ["play", play]]) {
      snapshots.push(await page.evaluate(async ({pose, manifest, kind}) => {
        const {default: state} = await import("/src/state.js");
        const B = {Vector3: state.scene.activeCamera.position.constructor};
        const {applyTimeOfDay} = await import("/src/lighting.js");
        const {setCameraPosition} = await import("/src/scene.js");
        const {NativeSceneLighting} = await import("/src/rendering/NativeSceneLighting.js");
        const {nativeLightingArea} = await import("/src/rendering/SceneEnvironmentProfiles.js");
        state.engine.stopRenderLoop();
        state.sceneEnvironment?.clear();
        window.fixtureLight?.clear();
        const camera = state.scene.activeCamera;
        camera.minZ = 0.1;
        camera.maxZ = 100000;
        camera.fov = 0.8;
        // The orbit viewer limits zoom relative to the previous scene's size;
        // normalize it as well as the pose for a fixed interior comparison.
        camera.lowerRadiusLimit = 0.01;
        camera.upperRadiusLimit = 100000;
        setCameraPosition(camera, B.Vector3.FromArray(pose.position));
        camera.setTarget(B.Vector3.FromArray(pose.target));
        if (Number.isFinite(camera.alpha)) setCameraPosition(camera, B.Vector3.FromArray(pose.position));
        state.isInteriorScene = true;
        applyTimeOfDay(0);
        window.fixtureLight = new NativeSceneLighting({scene:state.scene, getActorPosition:()=>camera.position});
        window.fixtureLight.create({nativePointLightingArea: kind === "mt5" ? nativeLightingArea(manifest.nativeArea) : undefined});
        document.body.append(state.canvas);
        document.body.className = "";
        document.querySelectorAll("body > *").forEach(element => {
          if (!element.contains(state.canvas)) element.style.display = "none";
        });
        state.canvas.style.cssText = "position:fixed;inset:0;width:900px;height:700px;z-index:999999;display:block";
        state.engine.setSize(900,700);
        await state.scene.whenReadyAsync();
        state.engine.runRenderLoop(() => state.scene.render());
        for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame);
        const roots = state.currentMeshes.filter(root => root._filename);
        state.scene.render();
        const sample = document.createElement("canvas");
        sample.width = sample.height = 32;
        const ctx = sample.getContext("2d");
        ctx.drawImage(state.canvas, 0, 0, 32, 32);
        const pixels = [...ctx.getImageData(0, 0, 32, 32).data];
        return {pixels, roots:roots.map(root => ({
          filename:root._filename,
          vertices:root.getChildMeshes().reduce((sum,mesh)=>sum+mesh.getTotalVertices(),0),
          indices:root.getChildMeshes().reduce((sum,mesh)=>sum+mesh.getTotalIndices(),0),
        })).sort((a,b)=>a.filename.localeCompare(b.filename))};
      }, {pose, manifest, kind}));
      await page.locator("#renderCanvas").screenshot({path:`tests/reports/shared-renderer-${kind}-${name}.png`});
    }
    expect(snapshots[0].roots.length).toBeGreaterThan(0);
    expect(snapshots[1].roots).toEqual(snapshots[0].roots);
    for (const snapshot of snapshots) {
      const colors = new Set();
      for (let i = 0; i < snapshot.pixels.length; i += 4) colors.add(snapshot.pixels.slice(i, i + 3).join(","));
      expect(colors.size, "capture must contain rendered textured geometry").toBeGreaterThan(50);
    }
    const difference = snapshots[0].pixels.reduce((sum, value, index) => sum + Math.abs(value - snapshots[1].pixels[index]), 0) / snapshots[0].pixels.length;
    expect(difference, "matched rendered views should agree").toBeLessThan(3);
  }
  expect(errors).toEqual([]);
  await context.close();
});
