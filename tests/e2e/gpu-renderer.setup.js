import { test } from "@playwright/test";
import { probePlaywrightRenderer } from "../../scripts/testing/playwright-renderer.mjs";

test("WebGL renders with the requested GPU mode", async ({ page }, testInfo) => {
  const renderer = await probePlaywrightRenderer(page);
  console.info(`[Playwright renderer] ${renderer.renderer}`);
  await testInfo.attach("webgl-renderer", {
    body: JSON.stringify(renderer, null, 2), contentType: "application/json",
  });
});
