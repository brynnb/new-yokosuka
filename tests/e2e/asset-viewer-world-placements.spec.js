import { test, expect } from "@playwright/test";

test("reviewed Shenmue I area views use the gameplay placements and standalone assets stay independent", async ({page}) => {
  test.skip(Boolean(process.env.E2E_PREVIEW_ORIGIN), "Placement inspection uses Vite source modules");
  test.setTimeout(360_000);
  await page.goto("/asset-viewer/", {waitUntil: "domcontentloaded"});
  await expect(page.getByRole("button", {name:"Dobuita",exact:true})).toBeVisible({timeout:120_000});
  const areas = await page.evaluate(async () => {
    const { WORLDS } = await import("/play/config/worlds.js");
    return [...new Set(Object.values(WORLDS).filter(world => !world.assetFormat && world.prefix).map(world => world.prefix))];
  });
  for (const prefix of areas) {
    const result = await page.evaluate(async prefix => {
      const { default: state } = await import("/src/state.js");
      const { loadScene } = await import("/src/catalog.js");
      const { viewerWorldForPrefix } = await import("/src/ViewerWorldPlan.js");
      const { viewerExportNodes } = await import("/src/ViewerExportSelection.js");
      const ok = await loadScene(prefix);
      const rows = viewerWorldForPrefix(prefix).placements;
      const roots = state.currentMeshes.filter(root => root._runtimePlacement);
      const selected = viewerExportNodes(state.currentMeshes);
      return {
        ok, expected:rows.length, actual:roots.length,
        audit:state.viewerPlacementAudit?.status,
        wrong:roots.filter(root => root.position.asArray().some((v,i) =>
          Math.abs(v-root._runtimePlacementRecord.position[i])>1e-6)).length,
        hiddenExported:roots.filter(root => !root.isEnabled() && selected.has(root)).length,
        scheduled:state.currentMeshes.filter(root=>root._scheduledSceneObject).length,
      };
    }, prefix);
    expect(result.ok, prefix).toBe(true);
    expect(result.actual,prefix).toBe(result.expected);
    expect(result.audit,prefix).toBe("verified");
    expect(result.wrong,prefix).toBe(0);
    expect(result.hiddenExported,prefix).toBe(0);
    if(prefix==="S1_D000") expect(result.scheduled).toBe(16);
  }
  const standalone = await page.evaluate(async () => {
    const { default: state } = await import("/src/state.js");
    const { loadModelFromUrl } = await import("/src/catalog.js");
    await loadModelFromUrl("S1_D000_DR00_002.MT5",null);
    return {single:state.singleModelMode, roots:state.currentMeshes.length,
      placed:state.currentMeshes.filter(root=>root._runtimePlacement).length};
  });
  expect(standalone.single).toBe(true);
  expect(standalone.roots).toBeGreaterThan(0);
  expect(standalone.placed).toBe(0);
});
