import { test } from "@playwright/test";
import { probePlaywrightRenderer } from "../../scripts/testing/playwright-renderer.mjs";
import { assertBrowserProcessMemoryBudget } from "../../scripts/testing/test-resources.mjs";

test("WebGL renders with the requested GPU mode", async ({ browser, page }, testInfo) => {
  const resourceChecks = [];
  let cdp, testFailure;
  const verifyResources = async phase => {
    let evidence;
    try {
      // Browser-level CDP reports only this launched browser's process tree.
      const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
      evidence = { phase, ...assertBrowserProcessMemoryBudget(processInfo) };
    } catch (error) {
      evidence = { phase, ...error.resourceEvidence, error: error.message };
      throw error;
    } finally {
      resourceChecks.push(evidence);
      console.info(`[Playwright browser resources] ${JSON.stringify(evidence)}`);
    }
  };
  try {
    cdp = await browser.newBrowserCDPSession();
    await verifyResources("browser-start");
    const renderer = await probePlaywrightRenderer(page);
    // WebGL can start an additional GPU/utility process after browser launch.
    await verifyResources("webgl-ready");
    console.info(`[Playwright renderer] ${renderer.renderer}`);
    await testInfo.attach("webgl-renderer", {
      body: JSON.stringify(renderer, null, 2), contentType: "application/json",
    });
  } catch (error) {
    testFailure = error;
    if (!resourceChecks.length) resourceChecks.push({ phase: "browser-cdp", error: error.message });
    throw error;
  } finally {
    try {
      await testInfo.attach("browser-process-resources", {
        body: JSON.stringify({ checks: resourceChecks }, null, 2), contentType: "application/json",
      });
    } catch (error) {
      if (!testFailure) throw error;
      console.error(`[Playwright browser resources] Evidence attachment failed: ${error.message}`);
    } finally {
      await cdp?.detach().catch(() => {});
    }
  }
});
