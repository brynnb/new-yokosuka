import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlaywrightRenderer,
  playwrightRendererOptions,
} from "../scripts/testing/playwright-renderer.mjs";

test("Linux browser launches select hardware Vulkan without software fallback", () => {
  const options = playwrightRendererOptions({}, "linux");
  assert.equal(options.channel, "chromium");
  assert.ok(options.args.includes("--use-angle=vulkan"));
  assert.ok(options.args.includes("--disable-software-rasterizer"));
  assert.ok(!playwrightRendererOptions({}, "darwin").args.includes("--use-angle=vulkan"));
});

test("missing or software renderers fail before running a 3D workload", () => {
  for (const renderer of [null, "", "ANGLE (SwiftShader Device (Subzero))", "llvmpipe (LLVM)", "softpipe"]) {
    assert.throws(() => assertPlaywrightRenderer(renderer, {}));
  }
  assert.doesNotThrow(() => assertPlaywrightRenderer("ANGLE (AMD Radeon RX 9070 XT, Vulkan)", {}));
});

test("software rendering is an explicit opt-out, not an automatic retry", () => {
  assert.throws(() => playwrightRendererOptions({ PLAYWRIGHT_HARDWARE_GPU: "false" }));
  const env = { PLAYWRIGHT_SOFTWARE_RENDERING: "true" };
  assert.deepEqual(playwrightRendererOptions(env).args, []);
  assert.doesNotThrow(() => assertPlaywrightRenderer("SwiftShader", env));
  assert.throws(() => assertPlaywrightRenderer(null, env));
});
