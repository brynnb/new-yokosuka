import { test, expect } from "@playwright/test";

test("hosted runtime assets decode without bundled payload URLs", async ({ page }) => {
  test.setTimeout(90_000);
  // Use a minimal document so this tests asset delivery without creating an
  // account or triggering unrelated world requests.
  await page.route("**/runtime-asset-probe", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Runtime assets</title>",
  }));
  await page.goto("/runtime-asset-probe");
  const result = await page.evaluate(async () => {
    const { runtimeAssets, runtimeAssetUrl, runtimeAssetGroup } = await import("/src/RuntimeAssets.js");
    const { createGameAudio } = await import("/play/audio/MediaElementAudio.js");
    const files = [
      "play/assets/characters/FUK_M.CHRM",
      "play/assets/characters/FUK_textures.bin",
      "play/assets/scheduled-actors/M_MBAS.BIN",
      "play/assets/combat/energy/bgdragon.png",
      "public/audio/forklift/a9040100.webm",
      "public/music/op00-open1.ogg",
    ];
    const checks = [];
    for (const file of files) {
      const url = runtimeAssetUrl(file);
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
        .map(n => n.toString(16).padStart(2, "0")).join("");
      if (sha256 !== runtimeAssets[file].sha256) throw new Error(`Checksum mismatch: ${file}`);
      checks.push({ file, url, size: buffer.byteLength });
    }
    const image = new Image();
    image.src = runtimeAssetUrl("play/assets/combat/energy/bgdragon.png");
    await image.decode();
    const audio = createGameAudio("/audio/forklift/a9040100.webm");
    audio.preload = "metadata";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Audio metadata timeout")), 20_000);
      audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      audio.onerror = () => { clearTimeout(timer); reject(new Error("Audio decode failed")); };
      audio.load();
    });
    const audioUrl = audio.currentSrc;
    audio.removeAttribute("src"); audio.load();
    return { checks, imageWidth: image.naturalWidth, audioUrl,
      characters: Object.keys(runtimeAssetGroup("play/assets/characters/*.CHRM")).length };
  });
  expect(result.characters).toBe(241);
  expect(result.imageWidth).toBeGreaterThan(0);
  expect(result.audioUrl).toContain("/shenmue/runtime/");
  for (const check of result.checks) {
    expect(check.url).toContain("/shenmue/runtime/");
    expect(check.size).toBeGreaterThan(0);
  }
});
