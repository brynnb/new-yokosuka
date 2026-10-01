// Shared by the Playwright config and standalone rendered diagnostics.
// Chromium's headless defaults can choose SwiftShader even on a GPU desktop.
export function playwrightRendererOptions(env = process.env, platform = process.platform) {
  const software = env.PLAYWRIGHT_SOFTWARE_RENDERING === "true";
  if (env.PLAYWRIGHT_HARDWARE_GPU === "false" && !software) {
    throw new Error("CPU rendering requires explicit PLAYWRIGHT_SOFTWARE_RENDERING=true");
  }
  return {
    channel: "chromium",
    args: software ? [] : [
      "--enable-gpu",
      "--disable-software-rasterizer",
      ...(platform === "linux" ? [
        "--use-gl=angle",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
        "--disable-vulkan-surface",
        "--ignore-gpu-blocklist",
      ] : []),
    ],
  };
}

export function assertPlaywrightRenderer(renderer, env = process.env) {
  if (typeof renderer !== "string" || !renderer.trim()) {
    throw new Error("Chromium did not expose a WebGL renderer");
  }
  if (env.PLAYWRIGHT_SOFTWARE_RENDERING !== "true"
    && /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(renderer)) {
    throw new Error(`Hardware GPU required; refusing CPU renderer: ${renderer}`);
  }
}

export async function probePlaywrightRenderer(page) {
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
    gl.clearColor(0.25, 0.5, 0.75, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const result = { renderer, pixel: Array.from(pixel), error: gl.getError() };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return result;
  });
  assertPlaywrightRenderer(result?.renderer);
  if (result.error !== 0 || result.pixel.some((value, index) => (
    Math.abs(value - [64, 128, 191, 255][index]) > 1
  ))) throw new Error(`WebGL pixel readback failed: ${JSON.stringify(result)}`);
  return result;
}
