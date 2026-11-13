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


test("Linux isolates the browser session bus while preserving the supplied launch environment", () => {
  for (const software of [false, true]) {
    for (const existingBus of [false, true]) {
      const env = Object.freeze({ PATH: "/fixture/bin", DISPLAY: ":7", XDG_RUNTIME_DIR: "/run/user/fixture",
        ...(software ? { PLAYWRIGHT_SOFTWARE_RENDERING: "true" } : {}),
        ...(existingBus ? { DBUS_SESSION_BUS_ADDRESS: "unix:path=/fixture/user/bus" } : {}),
      });
      const before = { ...env };
      const options = playwrightRendererOptions(env, "linux");
      assert.notEqual(options.env, env, "browser overrides must not mutate the launcher's environment");
      assert.deepEqual(options.env, { ...before, DBUS_SESSION_BUS_ADDRESS: "unix:path=/dev/null" });
      assert.deepEqual(env, before);
    }
  }
});

test("non-Linux browser launches retain the existing inherited-environment behavior", () => {
  const env = Object.freeze({ DBUS_SESSION_BUS_ADDRESS: "unix:path=/fixture/user/bus", DISPLAY: ":7" });
  for (const platform of ["darwin", "win32"]) {
    const options = playwrightRendererOptions(env, platform);
    assert.equal(Object.hasOwn(options, "env"), false);
  }
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, "unix:path=/fixture/user/bus");
});
