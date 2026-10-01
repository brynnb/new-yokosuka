import { expect, test } from "./release-preview-fixture.js";

test("landing links and ordered screenshot gallery work with mouse and keyboard", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".intro")).toContainText("browser with no installation required");
  const actions = page.locator(".actions a");
  await expect(actions).toHaveText(["Explore Assets", "Play Online", "Github", "Join Discord"]);
  expect(await actions.evaluateAll(links => new Set(links.map(link => Math.round(link.getBoundingClientRect().width))).size)).toBe(1);
  await expect(page.locator(".project-description")).toContainText("All assets were reverse engineered from the original Dreamcast game discs using my extractor tooling that was also helped in large part by community tooling listed in the credits.");
  const buttonRows = await actions.evaluateAll(links => links.map(link => Math.round(link.getBoundingClientRect().top)));
  expect(buttonRows[0]).toBe(buttonRows[1]);
  expect(buttonRows[2]).toBe(buttonRows[3]);
  expect(buttonRows[2]).toBeGreaterThan(buttonRows[0]);
  const alignment = await page.evaluate(() => {
    const group = document.querySelector(".actions").getBoundingClientRect();
    const copy = document.querySelector(".intro").getBoundingClientRect();
    return { centerOffset: group.x + group.width / 2 - copy.x - copy.width / 2 };
  });
  expect(Math.abs(alignment.centerOffset)).toBeLessThan(1);
  await expect(page.getByText("Desktop browsers are recommended", { exact: true })).toHaveCount(0);
  await expect(actions.nth(2)).toHaveAttribute("href", "https://github.com/brynnb/new-yokosuka");
  await expect(actions.nth(2).locator("svg")).toBeVisible();
  await expect(page.locator(".footer-credit a")).toHaveText(["Brynn"]);
  await expect(page.locator(".footer-credit")).toContainText("Hire me!");

  const thumbnails = page.locator(".screenshot-link");
  await expect(thumbnails).toHaveCount(9);
  const cardColor = await page.locator(".project-card").evaluate(card => getComputedStyle(card).backgroundColor);
  await expect(thumbnails.first()).toHaveCSS("background-color", cardColor);
  await expect(thumbnails.first()).toHaveCSS("border-top-width", "0px");
  expect(await thumbnails.first().evaluate(link => parseFloat(getComputedStyle(link).paddingTop))).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < 9; i++) {
    await expect(thumbnails.nth(i)).toHaveAttribute("href", `/screenshots/${i + 1}.webp`);
    await thumbnails.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => thumbnails.nth(i).locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  const positions = await thumbnails.evaluateAll(links => links.map(link => {
    const r = link.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }));
  expect(new Set(positions.map(p => p.x)).size).toBe(3);
  expect(new Set(positions.map(p => p.y)).size).toBe(3);
  await thumbnails.locator("img").evaluateAll(images => Promise.all(images.map(img => img.decode())));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png"), fullPage: true });

  const dialog = page.getByRole("dialog", { name: "Expanded screenshot" });
  for (let i = 0; i < 9; i++) {
    await thumbnails.nth(i).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toHaveAttribute("src", new RegExp(`/screenshots/${i + 1}\\.webp$`));
    await expect.poll(() => dialog.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    // An image click must not dismiss the lightbox.
    await dialog.locator("img").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeVisible();
    if (i === 0) await page.screenshot({ path: testInfo.outputPath("expanded-image.png") });
    if (i % 2 === 0) await page.keyboard.press("Escape");
    else await page.mouse.click(5, 5);
    await expect(dialog).not.toBeVisible();
    await expect(thumbnails.nth(i)).toBeFocused();
    await expect(thumbnails.nth(i)).toHaveCSS("outline-style", "none");
  }
  await thumbnails.first().focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close screenshot" }).click();
  await expect(thumbnails.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(thumbnails.nth(1)).toBeFocused();
  await expect(thumbnails.nth(1)).toHaveCSS("outline-style", "solid");

  // Credits use the same native modal behavior rather than a separate overlay.
  await page.getByRole("button", { name: "Credits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Credits & Resources" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Credits", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("gallery and expanded image fit a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".screenshot-gallery").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".screenshot-link img").evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  // Complete downloads are not proof that decoding="async" images have painted.
  // Match the desktop capture boundary instead of recording empty gallery cards.
  await page.locator(".screenshot-link img").evaluateAll(images => Promise.all(images.map(img => img.decode())));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Expand screenshot 9", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded screenshot" });
  await expect.poll(() => dialog.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath("expanded-mobile.png") });
  await page.mouse.click(5, 5);
  await expect(dialog).not.toBeVisible();
});
