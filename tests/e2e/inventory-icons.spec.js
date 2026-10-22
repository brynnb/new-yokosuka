import { expect, test } from "@playwright/test";

test("HQ inventory renders transparent icons in grey slots without loading reserve art", async ({ page }, testInfo) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  page.on("request", (request) => requests.push(request.url()));
  // Exercise the real /play UI, theme, modal and asset loading without starting
  // the unrelated 3D world, account flow or multiplayer connection.
  await page.route("**/play/play.js*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      import { openInventory, configureInventoryUi } from '/play/ui/react/inventoryStore.js';
      import { INVENTORY_ITEMS } from '/play/ui/react/inventoryItems.js';
      import { useAccountStore } from '/play/account/react/accountStore.js';
      useAccountStore.setState({ screen: 'closed' });
      document.body.classList.remove('account-pending');
      document.querySelector('#loading')?.remove();
      configureInventoryUi({loadInventory:async()=>INVENTORY_ITEMS.map(item=>({key:item.id.replaceAll('-','_'),name:item.name,category:'key_item',quantity:1}))});
      openInventory();
    `,
  }));
  await page.goto("/play/");
  const dialog = page.getByRole("dialog", { name: "Inventory", exact: true });
  await expect(dialog).toBeVisible();
  const icons = dialog.locator("img.inventory-slot-icon");
  await expect(icons).toHaveCount(16);
  const results = await icons.evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 256, 256);
    const data = context.getImageData(0, 0, 256, 256).data;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
    return {
      name: image.alt, width: image.naturalWidth, transparent,
      slot: getComputedStyle(image.parentElement, "::before").backgroundColor,
    };
  })));
  for (const result of results) {
    expect(result.width, result.name).toBe(256);
    expect(result.transparent, result.name).toBeGreaterThan(0);
    expect(result.transparent, result.name).toBeLessThan(256 * 256);
    expect(result.slot, result.name).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.slot, result.name).not.toBe("rgb(255, 255, 255)");
  }
  await expect(dialog.getByRole("img", { name: "Phoenix Mirror", exact: true })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Sword Handguard", exact: true })).toBeVisible();
  expect(requests.some((url) => url.includes("/reserve/"))).toBe(false);
  await expect(page.getByRole("button", { name: "Close inventory" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("inventory-hq-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("inventory-hq-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
