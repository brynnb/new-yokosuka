import { expect, test } from "@playwright/test";

const s1 = { tracks: { one: { label: "Dobuita test", url: "/test.ogg", source: { file: "BGM067.SND" } } } };
const s2 = { tracks: {
  two: { label: "Second game music", ogg_url: "/test.ogg", category: "music", discs: [2, 3], source: { file: "S2-MUSIC.SND" } },
  four: { label: "Fourth disc ambience", ogg_url: "/test.ogg", category: "ambient", discs: [4], source: { file: "S2-AMBIENT.SND" } },
} };

test("community titles preserve bank search, subsongs and existing credits", async ({ page }) => {
  await page.goto("/asset-viewer/?mode=audio&game=shenmue2");
  const catalog = page.locator("#audio-catalog-root");
  await catalog.getByLabel("Search audio").fill("0002_012");
  await expect(catalog.locator(".audio-track")).toHaveCount(2);
  await expect(catalog.getByText("Xiuying Ability Test", { exact: true })).toBeVisible();
  await expect(catalog.getByText("Xiuying Battle", { exact: true })).toBeVisible();
  await catalog.getByLabel("Search audio").fill("Hong Kong Battle");
  await expect(catalog.locator(".audio-track")).toHaveCount(1);
  await expect(catalog.locator(".audio-track")).toContainText("0001_002.SND · Sequence 1");
  await page.screenshot({ path: "tests/reports/audio-titles.png" });
  await page.goto("/");
  await page.getByRole("button", { name: "Credits", exact: true }).click();
  const credits = page.getByRole("dialog");
  await expect(credits).toContainText("Nameless Legacy");
  await expect(credits).toContainText("Tom Bowen");
  await expect(credits.getByRole("link", { name: "Shenmue II music filename-to-title mappings" })).toBeVisible();
  await page.screenshot({ path: "tests/reports/audio-title-credits.png" });
});

test("audio game navigation, disc filtering, retry and stale catalog handling", async ({ page }) => {
  let fail = true;
  await page.route("**/music/asset-viewer-manifest.json", route => route.fulfill({ json: s1 }));
  await page.route("**/music/shenmue2-asset-viewer-manifest.json", async route => {
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.fulfill({ json: s2 });
  });
  await page.goto("/asset-viewer/?mode=audio");
  const catalog = page.locator("#audio-catalog-root");
  await expect(catalog.getByText("Dobuita test", { exact: true })).toBeVisible();
  await catalog.getByRole("button", { name: "Shenmue II", exact: true }).click();
  await expect(catalog.getByRole("alert")).toContainText("503");
  fail = false;
  await catalog.getByRole("button", { name: "Retry" }).click();
  await expect(catalog.getByText("Second game music", { exact: true })).toBeVisible();
  await catalog.getByLabel("Audio disc").selectOption("4");
  await expect(catalog.getByText("Second game music", { exact: true })).toHaveCount(0);
  await catalog.getByRole("button", { name: /Ambient/ }).click();
  await expect(catalog.getByText("Fourth disc ambience", { exact: true })).toBeVisible();
  await catalog.getByLabel("Search audio").fill("does not exist");
  await expect(catalog.getByRole("status")).toContainText("0 tracks");
  await page.goBack();
  await expect(catalog.getByText("Dobuita test", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(catalog.getByText("Second game music", { exact: true })).toBeVisible();

  // A new page prevents the successful cache from hiding the late-response race.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.unroute("**/music/shenmue2-asset-viewer-manifest.json");
  await page.route("**/music/shenmue2-asset-viewer-manifest.json", async route => {
    await gate;
    await route.fulfill({ json: s2 });
  });
  await page.goto("/asset-viewer/?mode=audio&game=shenmue2");
  await expect(catalog.getByRole("button", { name: "Shenmue II", exact: true })).toHaveAttribute("aria-pressed", "true");
  await catalog.getByRole("button", { name: "Shenmue I", exact: true }).click();
  await expect(catalog.getByText("Dobuita test", { exact: true })).toBeVisible();
  release();
  await expect(catalog.getByText("Second game music", { exact: true })).toHaveCount(0);
});

test("extracted Shenmue II audio plays, seeks, downloads, and stops on game switch", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/asset-viewer/?mode=audio&game=shenmue2");
  const catalog = page.locator("#audio-catalog-root");
  const track = catalog.locator(".audio-track").first();
  await expect(track).toBeVisible();
  await track.click();
  const audio = page.locator("#audio-player-root audio");
  await expect.poll(() => audio.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(0);
  expect(await audio.evaluate(element => element.currentSrc)).toContain("/shenmue/runtime/");
  expect(await audio.evaluate(element => element.duration)).toBeCloseTo(180, 0);
  await audio.evaluate(element => { element.currentTime = 60; });
  await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(60);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download OGG" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.ogg$/);
  const mp3 = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MP3" }).click();
  expect((await mp3).suggestedFilename()).toMatch(/\.mp3$/);
  await page.screenshot({ path: "tests/reports/audio-archive-shenmue2.png" });
  await catalog.getByRole("button", { name: "Shenmue I", exact: true }).click();
  await expect.poll(() => audio.evaluate(element => element.paused && !element.getAttribute("src"))).toBe(true);
});

test("existing Shenmue I audio still plays through the shared asset host", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/asset-viewer/?mode=audio");
  const track = page.locator("#audio-catalog-root .audio-track").first();
  await expect(track).toBeVisible();
  await track.click();
  const audio = page.locator("#audio-player-root audio");
  await expect.poll(() => audio.evaluate(element => element.currentTime), { timeout: 60000 }).toBeGreaterThan(0);
  await page.screenshot({ path: "tests/reports/audio-archive-shenmue1.png" });
  await page.getByRole("button", { name: "Shenmue", exact: true }).click();
  await expect.poll(() => audio.evaluate(element => element.paused && !element.getAttribute("src"))).toBe(true);
});
