import fs from "node:fs";
import { expect, test } from "@playwright/test";

const motionPath = ".disc-work/runtime-motion/MOTION.BIN";
const assets = [motionPath, "public/models/S2_YDB1_YKC_M.MT5", "public/models/S2_YDB1_textures.bin"];

test("gameplay body and cloth share GPU lighting without showing the lining", async ({ page }, testInfo) => {
  test.skip(!assets.every(file => fs.existsSync(file)), "requires extracted Ryo model, textures and standing motion");
  test.setTimeout(90_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 800, height: 800 });
  // An isolated model fixture: no accounts, cutscenes, world loading or other
  // browser sessions. It exercises the real gameplay model and GPU rig.
  await page.route("**/jacket-lighting-probe", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><style>body{margin:0}canvas{display:block;width:800px;height:800px}</style><canvas id="probe"></canvas>',
  }));
  await page.route("**/jacket-motion-probe", route => route.fulfill({
    contentType: "application/octet-stream", body: fs.readFileSync(motionPath),
  }));
  await page.goto("/jacket-lighting-probe");
  try {
    const checks = await page.evaluate(async () => {
      const { CharacterRuntime } = await import("/play/characters/CharacterRuntime.js");
      // Reuse Vite's canonical bundle; a second Babylon import would register
      // engine extensions twice and invalidate the test.
      const babylonUrl = performance.getEntriesByType("resource").find(entry =>
        entry.name.includes("/deps/@babylonjs_core.js"))?.name;
      if (!babylonUrl) throw new Error("Cannot locate the gameplay Babylon bundle");
      const [B, { MotnLoader }, { evaluateRyoMotnFrame }, { RYO_YK_RENDER_MATRIX_ROUTES },
        { createLights, applyLightingPreset }, { DEFAULT_LIGHTING }, { default: state },
        { mt5AuthoredSideOrientation }, { PlayerRuntime }, { buildNativeClothBodyColliders }] = await Promise.all([
        import(babylonUrl), import("/src/MotnLoader.js"), import("/src/RyoMotnRuntime.js"),
        import("/src/RuntimeMatrixRecording.js"), import("/src/lighting.js"),
        import("/src/constants.js"), import("/src/state.js"), import("/src/Mt5NormalPolicy.js"),
        import("/play/characters/PlayerRuntime.js"), import("/play/characters/NativeClothCollision.js"),
      ]);
      const engine = new B.Engine(document.querySelector("canvas"), true, { preserveDrawingBuffer: true });
      const scene = new B.Scene(engine);
      window.__jacketProbe = { engine, scene };
      scene.clearColor = new B.Color4(0.15, 0.15, 0.15, 1);
      const camera = new B.FreeCamera("rear", new B.Vector3(0, 1.3, 1.8), scene);
      camera.setTarget(new B.Vector3(0, 1.25, 0));
      camera.minZ = 0.01;
      state.scene = scene;
      createLights(scene);
      const fetchArrayBuffer = async path => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return response.arrayBuffer();
      };
      const runtime = new CharacterRuntime({ scene,
        renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES), fetchArrayBuffer });
      const { loader, root } = await runtime.createModel({ label: "Ryo", model: "S2_YDB1_YKC_M.MT5",
        modelUrl: "/models/S2_YDB1_YKC_M.MT5", texturePackUrl: "/models/S2_YDB1_textures.bin", ryoHeadAtlasFix: true });
      applyLightingPreset(DEFAULT_LIGHTING);
      const names = ["AKI_AKI_STAND_DOWN_LP", "A_WALK_L_02"];
      const motions = MotnLoader.parse(await fetchArrayBuffer("/jacket-motion-probe"), { sequenceNames: names });
      const setPose = (name, frame) => {
        const pose = evaluateRyoMotnFrame(motions.getSequence(name), frame).matrices;
        runtime.applyCharacterRigWorldMatrices(loader, root,
          new Map(RYO_YK_RENDER_MATRIX_ROUTES.map(([key, index]) => [key, pose[index]])));
        runtime.updateSecondaryMotion(root, 1 / 60);
      };
      setPose(names[0], 0);
      const body = root.getChildMeshes().find(mesh => mesh._mt5NodeAddress === 0xce48 && mesh.name === "mt5_tex_0");
      const cloth = root.getChildMeshes().filter(mesh => mesh._mt5NativeClothSide);
      const originals = root.getChildMeshes().filter(mesh => !mesh._mt5NativeClothSide)
        .map(mesh => [mesh, mesh.sideOrientation]);
      window.__jacketProbe.legacy = () => {
        for (const [mesh] of originals) mesh.sideOrientation = B.Material.CounterClockWiseSideOrientation;
      };
      window.__jacketProbe.restore = () => {
        for (const [mesh, orientation] of originals) mesh.sideOrientation = orientation;
      };
      window.__jacketProbe.walk = () => setPose(names[1], 7);
      let player;
      window.__jacketProbe.gameplay = (state, ticks) => {
        engine.stopRenderLoop();
        if (!player) {
          const actorRoot = new B.TransformNode("player", scene);
          root.parent = actorRoot;
          player = new PlayerRuntime({ scene, actorRoot, characterRuntime: runtime,
            locomotionRuntime: { apply: () => false }, applySupplementalPose() {} });
          player.characterLoader = loader;
          player.modelRoot = root;
          player.animation.clips = {
            idle: player.animation.buildClip(motions, names[0]),
            walk: player.animation.buildClip(motions, names[1]),
          };
          player.animation.apply();
        }
        for (let tick = 0; tick < ticks; tick++) {
          player.animation.update(1 / 30, state);
          player.updateSecondaryMotion(1 / 30);
        }
        scene.render();
        const model = runtime.presentationModels.get(root);
        const nativeCloth = runtime.nativeClothStates.get(root);
        const colliders = buildNativeClothBodyColliders({ modelCode: model.modelCode,
          controllerFamily: model.latestControllerFamily,
          controllerMatrices: model.latestControllerMatrices,
          characterSpaceMatrix: root._mt5CharacterContentRoot.computeWorldMatrix(true) });
        const seamErrors = nativeCloth.seamGroups.map(seam => {
          const points = seam.map(vertex => vertex.child.getVerticesData("position")
            .slice(vertex.vertexIndex * 3, vertex.vertexIndex * 3 + 3));
          return Math.max(...points.flatMap(point => Array.from(point,
            (value, axis) => Math.abs(value - points[0][axis]))));
        });
        return { acquired: nativeCloth.acquired, seconds: nativeCloth.runtimeSeconds,
          controllers: model.latestControllerMatrices.length, colliders: colliders.length,
          seamCount: seamErrors.length, seamError: Math.max(0, ...seamErrors),
          bodySkinned: body.skeleton === root._mt5CharacterGpuRig.skeleton,
          oneSided: cloth.every(mesh => mesh.material.backFaceCulling && !mesh.material.twoSidedLighting),
          positions: cloth.filter(mesh => mesh._mt5NativeClothSide === "exterior")
            .map(mesh => Array.from(mesh.getVerticesData("position"))) };
      };
      await scene.whenReadyAsync();
      engine.runRenderLoop(() => scene.render());

      // Real GPU pixels for equal-normal adjacent body/cloth panels. The red
      // opposite-winding lining is nearer the camera but must stay culled.
      window.__jacketProbe.checkPanels = async () => {
        engine.stopRenderLoop();
        const panels = new B.Scene(engine);
        try {
          panels.clearColor = new B.Color4(0, 0, 0, 1);
          const view = new B.FreeCamera("panels", new B.Vector3(0, 0, 3), panels);
          view.setTarget(B.Vector3.Zero());
          view.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
          view.orthoLeft = -1; view.orthoRight = 1; view.orthoTop = 1; view.orthoBottom = -1;
          const light = new B.DirectionalLight("front", new B.Vector3(0, 0, -1), panels);
          light.intensity = 0.5;
          for (const [name, x, oneSided, lining] of [["body", -0.5, false, false],
            ["cloth", 0.5, true, false], ["lining", 0.5, true, true]]) {
            const mesh = new B.Mesh(name, panels);
            mesh.setVerticesData("position", [-0.4, -0.4, 0, 0.4, -0.4, 0, 0.4, 0.4, 0, -0.4, 0.4, 0]);
            mesh.setVerticesData("normal", Array(4).fill([0, 0, lining ? -1 : 1]).flat());
            mesh.setIndices(lining ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
            mesh.position.set(x, 0, lining ? 0.01 : 0);
            mesh.sideOrientation = mt5AuthoredSideOrientation(mesh);
            const material = new B.StandardMaterial(name, panels);
            material.diffuseColor = lining ? new B.Color3(1, 0, 0) : new B.Color3(1, 1, 1);
            material.specularColor = B.Color3.Black();
            material.backFaceCulling = oneSided;
            material.twoSidedLighting = !oneSided;
            mesh.material = material;
          }
          await panels.whenReadyAsync();
          panels.render();
          const left = await engine.readPixels(200, 400, 1, 1);
          const right = await engine.readPixels(600, 400, 1, 1);
          return { body: Array.from(left), cloth: Array.from(right) };
        } finally { panels.dispose(); }
      };
      return { bodyOrientation: body.sideOrientation, exterior: cloth.filter(mesh => mesh._mt5NativeClothSide === "exterior")
        .map(mesh => mesh.sideOrientation), oneSided: cloth.every(mesh => mesh.material.backFaceCulling && !mesh.material.twoSidedLighting) };
    });
    expect(checks.bodyOrientation).toBe(0);
    expect(checks.exterior).toEqual([0, 0]);
    expect(checks.oneSided).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("fixed-standing.png") });
    await page.evaluate(() => window.__jacketProbe.legacy());
    await page.screenshot({ path: testInfo.outputPath("legacy-standing.png") });
    await page.evaluate(() => { window.__jacketProbe.restore(); window.__jacketProbe.walk(); });
    await page.screenshot({ path: testInfo.outputPath("fixed-walking.png") });
    const idleCloth = await page.evaluate(() => window.__jacketProbe.gameplay("idle", 90));
    expect(idleCloth).toMatchObject({ acquired: true, controllers: 37, colliders: 7, bodySkinned: true, oneSided: true });
    expect(idleCloth.seconds).toBeCloseTo(3);
    expect(idleCloth.seamCount).toBeGreaterThan(0);
    expect(idleCloth.seamError).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("cloth-standing.png") });
    const walkingCloth = await page.evaluate(() => window.__jacketProbe.gameplay("walk", 8));
    expect(walkingCloth.seconds).toBeGreaterThan(idleCloth.seconds);
    expect(walkingCloth.positions).not.toEqual(idleCloth.positions);
    expect(walkingCloth.seamError).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("cloth-walking.png") });
    const pixels = await page.evaluate(() => window.__jacketProbe.checkPanels());
    expect(pixels.body[0], "panels are lit, not background pixels").toBeGreaterThan(0);
    expect(pixels.body.slice(0, 3)).toEqual(Array(3).fill(pixels.body[0]));
    expect(pixels.cloth, "cloth lighting matches body and red lining is culled").toEqual(pixels.body);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      window.__jacketProbe?.scene.dispose();
      window.__jacketProbe?.engine.dispose();
    });
  }
});
