import { expect, test } from '@playwright/test';

test('Collection scrolls without moving its header, fits mobile, and supports failed/empty reads', async ({page}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let fail = false;
  let inventory = Array.from({length: 41}, (_, index) => ({
    key: `toy-${index}`, name: `Collected toy ${String(index + 1).padStart(2, '0')}`,
    quantity: index + 1, category: 'capsule_toy',
  }));
  await page.route('**/api/characters/42/state', route => route.fulfill(fail
    ? {status: 503, json: {error: 'Collection temporarily unavailable.'}}
    : {json: {inventory}}));
  // The real modal, theme and HTTP loader, with only the 3D application omitted.
  await page.route('**/play/play.js*', route => route.fulfill({contentType: 'application/javascript', body: `
    import {openInventory, configureInventoryUi} from '/play/ui/react/inventoryStore.js';
    import {AccountSession} from '/play/account/AccountSession.js';
    import {useAccountStore} from '/play/account/react/accountStore.js';
    const account = new AccountSession();
    configureInventoryUi({loadCollection: async signal =>
      (await account.request('/api/characters/42/state', {signal, cache: 'no-store'})).inventory});
    useAccountStore.setState({screen: 'closed'});
    document.body.classList.remove('account-pending');
    document.querySelector('#loading')?.remove();
    window.openCollection = () => openInventory('collection');
    window.openCollection();
  `}));
  await page.goto('/play/');
  const dialog = page.getByRole('dialog', {name: 'Collection', exact: true});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.inventory-entry')).toHaveCount(41);
  await expect(dialog.getByText('41 unique toys · 861 collected')).toBeVisible();
  const scroller = dialog.locator('[data-radix-scroll-area-viewport]');
  for (const size of [{width: 1280, height: 800}, {width: 390, height: 844}]) {
    await page.setViewportSize(size);
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByText('Collected toy 41', {exact: true})).toBeInViewport();
    await expect(dialog.getByRole('heading', {name: 'Collection'})).toBeInViewport();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({path: testInfo.outputPath(`collection-${size.width}.png`)});
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  fail = true;
  await page.evaluate(() => window.openCollection());
  await expect(dialog.getByText('Collection temporarily unavailable.')).toBeVisible();
  inventory = [];
  fail = false;
  await dialog.getByRole('button', {name: 'Retry'}).click();
  await expect(dialog.getByText(/No toys collected yet/)).toBeVisible();
  await expect(dialog.locator('.inventory-entry')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('collection renders real toys and opens an independently rotatable, cancellable preview', async ({page}, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_CAPSULE_MACHINES !== 'true', 'Requires local collection models');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/play/ui/CapsuleToyPreview.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: `${await response.text()}
      const showToy = CapsuleToyPreview.prototype.show;
      CapsuleToyPreview.prototype.show = function(...args) {
        (window.collectionPreviews ||= new Set()).add(this);
        return showToy.apply(this, args);
      };
    `});
  });
  await page.route('**/play/play.js*', route => route.fulfill({contentType: 'application/javascript', body: `
    import {openInventory, closeInventory, configureInventoryUi} from '/play/ui/react/inventoryStore.js';
    import {useAccountStore} from '/play/account/react/accountStore.js';
    window.collectionLifecycle = [];
    configureInventoryUi({
      onOpen: () => window.collectionLifecycle.push('open'),
      onClose: () => window.collectionLifecycle.push('close'),
      loadCollection: async () => [
        {key:'capsule_gacrnt1', name:'NiGHTS 1', category:'capsule_toy', quantity:2},
        {key:'capsule_gaciaka', name:'Akira 1', category:'capsule_toy', quantity:1},
        {key:'capsule_missing', name:'Unknown toy', category:'capsule_toy', quantity:1},
      ],
    });
    useAccountStore.setState({screen:'closed'});
    document.body.classList.remove('account-pending');
    document.querySelector('#loading')?.remove();
    window.closeCollection = closeInventory;
    window.openCollection = () => openInventory('collection');
    window.openCollection();
  `}));
  await page.goto('/play/');
  const collection = page.getByRole('dialog', {name:'Collection', exact:true});
  const card = collection.getByRole('button', {name:'Inspect NiGHTS 1'});
  await expect(card.locator('img')).toBeVisible({timeout: 30000});
  await expect(collection.getByRole('button', {name:'Inspect Akira 1'}).locator('img')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('collection-models.png')});
  await card.click();
  const popup = page.getByRole('dialog', {name:'NiGHTS 1', exact:true});
  const stage = popup.locator('.collection-toy-stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', {timeout:30000});
  const rotation = () => page.evaluate(() => [...window.collectionPreviews].find(p => p.controls)?.pivot.rotationQuaternion.asArray());
  const before = await rotation();
  await page.keyboard.down('a');
  await expect.poll(rotation).not.toEqual(before);
  await page.keyboard.up('a');
  const afterA = await rotation();
  await page.keyboard.down('d');
  await expect.poll(rotation).not.toEqual(afterA);
  await page.keyboard.up('d');
  const canvas = popup.getByLabel('3D preview of NiGHTS 1');
  const bounds = await canvas.boundingBox();
  for (const button of ['left','right']) {
    const previous = await rotation();
    await page.mouse.move(bounds.x + bounds.width/2, bounds.y + bounds.height/2);
    await page.mouse.down({button});
    await page.mouse.move(bounds.x + bounds.width/2 + 65, bounds.y + bounds.height/2 + 35, {steps:5});
    await page.mouse.up({button});
    expect(await rotation()).not.toEqual(previous);
  }
  await page.screenshot({path:testInfo.outputPath('collection-inspection.png')});
  await page.keyboard.press('x');
  await expect(popup).toBeHidden();
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => window.collectionLifecycle)).toEqual(['open']);
  await card.click();
  await expect(stage).toHaveAttribute('data-status', 'ready');
  await page.setViewportSize({width:390, height:844});
  const mobile = await popup.boundingBox();
  expect(mobile.x).toBeGreaterThanOrEqual(0);
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(390);
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(844);
  await page.screenshot({path:testInfo.outputPath('collection-inspection-mobile.png')});
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await collection.getByRole('button', {name:'Inspect Unknown toy'}).click();
  const missing = page.getByRole('dialog', {name:'Unknown toy', exact:true});
  await expect(missing.getByText(/No collection model is catalogued/)).toBeVisible();
  await missing.getByRole('button', {name:'Retry preview'}).click();
  await expect(missing.getByText(/No collection model is catalogued/)).toBeVisible();
  await page.keyboard.press('Escape');
  await card.click();
  await expect(stage).toHaveAttribute('data-status', 'ready');
  // Closing the enclosing UI (e.g. leaving the session) releases both renderers.
  await page.evaluate(() => window.closeCollection());
  await expect(popup).toBeHidden();
  await expect.poll(() => page.evaluate(() => [...window.collectionPreviews].every(p => p.disposed))).toBe(true);
  expect(await page.evaluate(() => window.collectionLifecycle)).toEqual(['open','close']);
  expect(errors).toEqual([]);
});

test('toy renderer rejects stale and timed-out loads, retries, and disposes while loading', async ({page}) => {
  test.skip(process.env.PLAYWRIGHT_CAPSULE_MACHINES !== 'true', 'Requires local collection models');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const held = new Map();
  // Hold the published model response, not the optional local-assets probe
  // (a local checkout may serve HTML there before falling back to R2).
  await page.route('**/shenmue/G_ITEM_GACR{NT1,MYU}G.MT5', async route => {
    await new Promise(resolve => held.set(route.request().url().split('/').pop(), resolve));
    await route.continue();
  });
  await page.route('**/collection-preview-test', route => route.fulfill({contentType:'text/html', body: `
    <!doctype html><canvas style="width:300px;height:300px"></canvas>
    <script type="module">
      import {CapsuleToyPreview} from '/play/ui/CapsuleToyPreview.js';
      window.preview = new CapsuleToyPreview(document.querySelector('canvas'));
    </script>
  `}));
  await page.goto('/collection-preview-test');
  await page.waitForFunction(() => window.preview);
  await page.evaluate(() => {
    window.first = window.preview.show('capsule_gacrnt1').catch(error => { window.firstError = error.name; });
  });
  await expect.poll(() => held.has('G_ITEM_GACRNT1G.MT5')).toBe(true);
  await page.evaluate(() => window.preview.show('capsule_gaciaka'));
  await expect.poll(() => page.evaluate(() => window.firstError)).toBe('AbortError');
  const firstResponse = page.waitForResponse('**/shenmue/G_ITEM_GACRNT1G.MT5');
  await page.evaluate(() => { window.currentPivot = window.preview.pivot; });
  held.get('G_ITEM_GACRNT1G.MT5')();
  await firstResponse;
  expect(await page.evaluate(() => window.preview.ready && window.preview.pivot === window.currentPivot)).toBe(true);
  await page.clock.install();
  await page.evaluate(() => {
    window.preview.show('capsule_gacrmyu').catch(error => { window.timeoutError = error.message; });
  });
  await expect.poll(() => held.has('G_ITEM_GACRMYUG.MT5')).toBe(true);
  await page.clock.fastForward(20001);
  await expect.poll(() => page.evaluate(() => window.timeoutError)).toMatch(/timed out/);
  expect(await page.evaluate(() => window.preview.scene)).toBe(null);
  // Retry while the shared immutable asset read is still pending, then close.
  await page.evaluate(() => {
    window.preview.show('capsule_gacrmyu').catch(error => { window.closedError = error.name; });
    window.preview.dispose();
  });
  await expect.poll(() => page.evaluate(() => window.closedError)).toBe('AbortError');
  const response = page.waitForResponse('**/shenmue/G_ITEM_GACRMYUG.MT5');
  held.get('G_ITEM_GACRMYUG.MT5')();
  await response;
  expect(await page.evaluate(() => window.preview.disposed && window.preview.scene === null)).toBe(true);
  await page.clock.resume();
  // The late shared response remains usable by a new owner.
  await page.evaluate(async () => {
    const {CapsuleToyPreview} = await import('/play/ui/CapsuleToyPreview.js');
    window.preview = new CapsuleToyPreview(document.querySelector('canvas'));
    await window.preview.show('capsule_gacrmyu');
  });
  expect(await page.evaluate(() => window.preview.ready)).toBe(true);
  await page.evaluate(() => window.preview.dispose());
  expect(errors).toEqual([]);
});
