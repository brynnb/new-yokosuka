import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("walking previews and the combat actor run shared secondary motion on the GPU renderer", async ({ page }, testInfo) => {
  const motionPath = ".disc-work/runtime-motion/MOTION.BIN";
  test.skip(!fs.existsSync(motionPath), "requires locally extracted motions");
  test.setTimeout(120_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    const text = message.text();
    // The isolated fixture has no multiplayer transport. The no-HMR server
    // still exposes Vite helpers, whose unused dev WebSocket can be denied by
    // Chromium's local-network policy. Do not count that as a renderer error.
    if (text.startsWith("[vite]") || /^WebSocket connection to .*\?token=/.test(text)) return;
    if (message.type() === "error") { errors.push(text); console.error(text); }
  });
  await page.setViewportSize({ width: 800, height: 800 });
  await page.route("**/secondary-motion-probe", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><style>body{margin:0;background:#444}#preview,canvas{display:block;width:800px;height:800px}</style><div id="preview"></div>' }));
  await page.route("**/secondary-motion-bank", route => route.fulfill({ contentType: "application/octet-stream", body: fs.readFileSync(motionPath) }));
  await page.goto("/secondary-motion-probe");
  try {
    await page.evaluate(async () => {
      const { CharacterPreview } = await import("/play/account/CharacterPreview.js");
      const { CHARACTER_BY_ID } = await import("/play/config/characters.js");
      window.secondaryProbe = { preview: new CharacterPreview(document.querySelector("#preview"), { motion: "walk" }), characters: [...CHARACTER_BY_ID.values()] };
    });
    for (const code of ["FRO_L", "HPX_L"]) {
      await page.evaluate(async code => {
        const { preview, characters } = window.secondaryProbe;
        await preview.show(characters.find(character => character.modelCode === code));
        if (!preview.status.hidden) throw new Error(`Preview ${code}: ${preview.status.textContent}`);
        window.secondaryProbe.startedAt = preview.motionElapsedSeconds;
      }, code);
      await page.waitForFunction(() => window.secondaryProbe.preview.motionElapsedSeconds - window.secondaryProbe.startedAt > 1);
      const result = await page.evaluate(async () => {
        const { nativeSecondaryMotionStateForModel } = await import("/play/characters/NativeSecondaryMotionRuntime.js");
        const { preview } = window.secondaryProbe;
        const model = preview.previewModel;
        const cloth = preview.runtime.nativeClothStates.get(preview.root);
        const secondary = nativeSecondaryMotionStateForModel(model);
        return { canonical: model === preview.runtime.presentationModel(model.loader, preview.root),
          controllers: model.latestControllerMatrices?.length, clothAcquired: cloth?.acquired,
          panels: cloth?.groups.length, chainFrames: secondary.chains.map(chain => chain.solver.frame),
          meshes: preview.root.getChildMeshes().filter(mesh => mesh._mt5NativeClothOutput)
            .map(mesh => ({ enabled: mesh.isEnabled(), cpuCloth: mesh.skeleton === null })) };
      });
      expect(result.canonical).toBe(true);
      expect(result.controllers).toBeGreaterThan(30);
      expect(result.clothAcquired).toBe(true);
      expect(result.panels).toBeGreaterThan(0);
      expect(result.chainFrames.length).toBeGreaterThan(0);
      expect(result.chainFrames.every(frame => frame > 10)).toBe(true);
      expect(result.meshes.some(mesh => mesh.enabled && mesh.cpuCloth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${code}-walking.png`) });
    }
    // Replace the preview while its previous asynchronous load is in flight.
    // Only the latest canonical model may retain the presentation lifecycle.
    await page.evaluate(async () => {
      const { preview, characters } = window.secondaryProbe;
      await Promise.all([preview.show(characters.find(c => c.modelCode === "FRO_L")),
        preview.show(characters.find(c => c.modelCode === "HPX_L"))]);
      if (preview.previewModel.modelCode !== "HPX_L") throw new Error("stale preview replaced the current character");
      preview.dispose();
      document.querySelector("#preview").replaceChildren();
    });
    const combatResult = await page.evaluate(async () => {
      const [{ CharacterRuntime }, { PlayerCombatRuntime }, { PlayerMotionBank, PLAYER_COMBAT_CONFIG },
        { SEQUENCES, LOCOMOTION_STATES }, { RYO_YK_RENDER_MATRIX_ROUTES }, { CHARACTER_BY_ID }] = await Promise.all([
        import("/play/characters/CharacterRuntime.js"), import("/play/characters/PlayerCombatRuntime.js"),
        import("/play/characters/PlayerMotionLibrary.js"), import("/play/config/animations.js"),
        import("/src/RuntimeMatrixRecording.js"), import("/play/config/characters.js"),
      ]);
      const B = await import(performance.getEntriesByType("resource").find(entry => entry.name.includes("/deps/@babylonjs_core.js")).name);
      const canvas = document.createElement("canvas");
      document.querySelector("#preview").append(canvas);
      const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true });
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(.2, .2, .2, 1);
      new B.HemisphericLight("ambient", new B.Vector3(0, 1, -.4), scene);
      const camera = new B.FreeCamera("camera", new B.Vector3(0, 1.3, -2.7), scene);
      camera.setTarget(new B.Vector3(0, .85, 0));
      camera.minZ = .01;
      const fetchArrayBuffer = async path => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.arrayBuffer(); };
      const runtime = new CharacterRuntime({ scene, renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES), fetchArrayBuffer });
      const reference = await runtime.createModel({ label: "Ryo", modelCode: "YKC_M", modelUrl: "/models/S2_YDB1_YKC_M.MT5" });
      runtime.setReferenceBind(reference.loader, reference.root);
      reference.root.setEnabled(false);
      const enemyRoot = new B.TransformNode("enemy", scene);
      const enemyModelOffset = new B.TransformNode("enemy-model", scene);
      enemyModelOffset.parent = enemyRoot;
      const playerRoot = new B.TransformNode("player", scene);
      const combat = new PlayerCombatRuntime({ enemyRoot, enemyModelOffset, playerRoot,
        playerAnimation: {}, characterRuntime: runtime, createCharacterModel: c => runtime.createModel(c),
        enemyCharacter: CHARACTER_BY_ID.get("chai"), getController: () => null, getBinding: () => null,
        combatConfig: PLAYER_COMBAT_CONFIG,
        animationConfig: { renderMatrixByKey: runtime.renderMatrixByKey, gameTicksPerSecond: 30,
          emoteBlendTicks: 3, locomotionBlendSeconds: .1, locomotionStates: LOCOMOTION_STATES,
          sequences: SEQUENCES, locomotionMotionFiles: {} },
      });
      const motion = new PlayerMotionBank("/secondary-motion-bank", { fetchBuffer: fetchArrayBuffer });
      const fightMotion = new PlayerMotionBank("/play/assets/account/M_ZAKO.MOTN", { fetchBuffer: fetchArrayBuffer });
      await Promise.all([motion.ensureLoaded(), fightMotion.ensureLoaded()]);
      await combat.load({ motion, fightMotion, supplementalMotions: new Map() });
      // Isolate rendering from combat AI/input; the real combat animation and
      // character model loaders/presentation run unchanged.
      combat.encounter.active = true;
      enemyRoot.setEnabled(true);
      for (let frame = 0; frame < 120; frame++) combat.updateAnimation(1 / 60);
      const model = runtime.presentationModels.get(combat.enemyModelRoot);
      const cloth = runtime.nativeClothStates.get(combat.enemyModelRoot);
      window.secondaryProbe.combat = { engine, scene, combat };
      engine.runRenderLoop(() => scene.render());
      return { controllers: model.latestControllerMatrices.length, acquired: cloth.acquired,
        panels: cloth.groups.length, initialized: cloth.groups.every(group => group.simulation.active) };
    });
    expect(combatResult.controllers).toBe(37);
    expect(combatResult.acquired).toBe(true);
    expect(combatResult.panels).toBe(2);
    expect(combatResult.initialized).toBe(true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("chai-combat-panels.png") });
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      const probe = window.secondaryProbe;
      if (probe?.preview?.host) probe.preview.dispose();
      if (probe?.combat) {
        probe.combat.combat.dispose(); probe.combat.scene.dispose(); probe.combat.engine.dispose();
      }
    });
  }
});
