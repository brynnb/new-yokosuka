import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("GLB progress reports work, recovers from a failed download, and completes on retry", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_PREVIEW_ORIGIN), "The generated scene uses the Vite source modules");
  test.setTimeout(120_000);

  // Keep the real viewer and serializer, without loading any game models from R2.
  await page.route("**/models.json", route => route.fulfill({ json: [] }));
  await page.goto("/asset-viewer/");
  await expect(page.getByText("Explore Shenmue", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { default: state } = await import("/src/state.js");
    await state.sceneLoadTask;
    const core = performance.getEntriesByType("resource").find(entry => entry.name.includes("/deps/@babylonjs_core.js"));
    const { MeshBuilder, StandardMaterial, RawTexture } = await import(core.name);
    const material = new StandardMaterial("fixture-material", state.scene);
    material.diffuseTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([32, 64, 128, 255]), 1, 1, state.scene, false,
    );
    for (let index = 0; index < 16; index++) {
      const part = MeshBuilder.CreateBox(`part-${index}`, {}, state.scene);
      part.material = material;
      part.position.x = index * 2;
      part._filename = "export-fixture.MT5";
      state.currentMeshes.push(part);
    }

    // Fail just the first browser download. The second click uses the same scene.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith(".glb")) {
        HTMLAnchorElement.prototype.click = click;
        throw new Error("Fixture download interrupted");
      }
      return click.call(this);
    };
  });

  const button = page.locator("#export-fab");
  const glb = page.locator("#export-glb-btn");
  const panel = page.locator("#export-progress");
  const bar = panel.locator("progress#export-progress-bar");
  const label = panel.locator("#export-progress-label");

  await button.click();
  await glb.click();
  await expect(label).toContainText("Fixture download interrupted");
  await expect(label).toBeVisible();
  await expect(bar).toBeHidden();
  await expect(button).toBeEnabled();

  // Observe the actual UI between async callbacks; small exports can otherwise
  // finish before Playwright's next poll and hide a regression in intermediate values.
  await bar.evaluate(element => {
    window.workPercentages = [];
    const observer = new MutationObserver(() => {
      const percent = 100 * element.position;
      if (percent > 0 && percent < 100 && element.checkVisibility()
          && document.getElementById("export-fab").disabled) {
        window.workPercentages.push(percent);
      }
    });
    observer.observe(element, { attributes: true });
  });

  await button.click();
  const downloadEvent = page.waitForEvent("download");
  await glb.click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  await expect(panel).toBeVisible();
  await expect(label).toContainText(/download started/i);
  await expect(bar).toBeVisible();
  expect(await bar.evaluate(element => element.position)).toBe(1);
  await expect(button).toBeEnabled();
  const progress = await page.evaluate(() => window.workPercentages);
  // A single stage transition would also produce one intermediate value.
  expect(new Set(progress).size).toBeGreaterThan(2);
  expect(progress).toEqual([...progress].sort((a, b) => a - b));

  const bytes = await readFile(await download.path());
  expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
  const parts = gltf.nodes.filter(node => node.name?.startsWith("part-"));
  expect(parts).toHaveLength(16);
  expect(parts.every(node => gltf.meshes[node.mesh]?.primitives.length > 0)).toBe(true);
  expect(gltf.images.some(image => Number.isInteger(image.bufferView))).toBe(true);
});
