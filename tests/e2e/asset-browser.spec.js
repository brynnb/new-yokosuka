import { expect, test } from "@playwright/test";

test.beforeEach(async ({page, baseURL}) => {
  // Test a local production build under the public origin so R2's real CORS
  // policy applies. Requests for application files are intercepted locally;
  // this does not publish files or alter the live site.
  const preview = process.env.E2E_PREVIEW_ORIGIN;
  if (preview) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(preview)) throw Error('Preview must be loopback');
    await page.route(`${new URL(baseURL).origin}/**`, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({url: `${preview}${url.pathname}${url.search}`});
      await route.fulfill({response});
    });
  }
});

test("both catalogs group, search, restore expansion, and survive switching games", async ({page}) => {
  test.setTimeout(120_000);
  await page.goto('/asset-viewer/?mode=shenmue2', {waitUntil:'domcontentloaded'});
  const root = page.locator('#model-list');
  await expect(root.locator(':scope > details')).toHaveCount(4, {timeout:60_000});
  await expect(root.locator(':scope > details[open]')).toHaveCount(0);
  const quick = root.locator(':scope > .main-views > .main-views-list');
  await expect(quick.locator(':scope > button[data-area="QGBT"]')).toHaveCount(1);
  await expect(quick.locator(':scope > button[data-area="AR02"]')).toHaveCount(1);
  await expect(quick.locator(':scope > button[data-area="KRH1"]')).toHaveCount(1);
  await expect(quick.locator('details, .scene-btn')).toHaveCount(0);
  await expect(root.locator(':scope > .main-views > details > summary')).toHaveText(['Interiors', 'Scene variants']);
  await expect(root.locator(':scope > .main-views > details[open]')).toHaveCount(0);
  const interiors = root.locator(':scope > .main-views > details').first();
  await interiors.locator(':scope > summary').click();
  await expect(interiors.getByRole('button', {name: 'Bar Swing', exact: true})).toHaveCount(1);
  await expect(interiors.getByRole('button', {name: 'Stone Pit', exact: true})).toBeVisible();
  await interiors.getByRole('button', {name: 'Bar Swing', exact: true}).click();
  await expect(page.locator('#interior-view-btn')).toBeEnabled({timeout:60_000});
  await interiors.screenshot({path:'tests/reports/asset-browser-s2-interiors.png'});
  await interiors.locator(':scope > summary').click();
  await quick.locator('button[data-area="QGBT"]').click();
  await expect(quick.locator('button[data-area="QGBT"]')).toHaveClass(/active/);
  const search = page.getByLabel('Find a location or asset');
  await search.fill('disc 2 bar swing');
  await expect(page.locator('#asset-search-status')).toContainText('matches');
  await expect(root.locator('.model-item:not([data-search-hidden])').first()).toBeVisible();
  const raw = await root.locator('.model-item:not([data-search-hidden])').first().getAttribute('title');
  await search.fill(raw);
  await expect(root.locator('.model-item:not([data-search-hidden])')).toHaveCount(1);
  await root.locator('.model-item:not([data-search-hidden])').click();
  await expect(root.locator('.model-item.active')).toHaveAttribute('title',raw);
  await search.fill('no-such-scene-xyz');
  await expect(page.locator('#asset-search-status')).toHaveText('No matching assets');
  await search.fill('');
  await expect(root.locator(':scope > details[open]')).toHaveCount(0);
  await root.locator(':scope > details > summary').nth(1).click();
  await root.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({path:'tests/reports/asset-browser-s2.png'});
  await page.getByRole('button',{name:'Collapse all',exact:true}).click();
  await expect(root.locator('details[open]')).toHaveCount(0);
  await page.getByRole('button',{name:'Shenmue',exact:true}).click();
  await expect(root.getByText('Explore Shenmue',{exact:true})).toBeVisible();
  await expect(quick.locator(':scope > button')).toHaveCount(6);
  await expect(quick.locator('details, .scene-btn')).toHaveCount(0);
  await expect(root.locator(':scope > .main-views > details > summary')).toHaveText(['Interiors', 'Scene variants']);
  await expect(root.locator(':scope > .main-views > details[open]')).toHaveCount(0);
  await interiors.locator(':scope > summary').click();
  await expect(interiors.getByRole('button', {name: 'Hazuki Residence Interior', exact: true})).toHaveCount(1);
  const fortuneTeller = interiors.getByRole('button', {name: 'Lapis Fortune Teller', exact: true});
  await fortuneTeller.click();
  await expect(fortuneTeller).toHaveClass(/active/);
  await expect(page.locator('#overview-view-btn')).toBeEnabled({timeout:60_000});
  await interiors.screenshot({path:'tests/reports/asset-browser-s1-interiors.png'});
  await interiors.locator(':scope > summary').click();
  await search.fill('JIMENHAL');
  await expect(root.locator('.main-view-component-button:not([data-search-hidden])')).toHaveCount(1);
  await expect(root.locator('.main-view-component-button:not([data-search-hidden])')).toBeVisible();
  await search.fill('');
  await expect(root.locator('.main-view-component-button').first()).toBeHidden();
  await root.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({path:'tests/reports/asset-browser-s1.png'});
  await page.getByRole('button',{name:'Shenmue II',exact:true}).click();
  await expect(root.locator(':scope > details')).toHaveCount(4);
  await search.fill('disc 4 Blue Dragon Garden');
  await expect(root.locator('.model-item:not([data-search-hidden])').first()).toBeVisible();
});

test('community item and map labels remain searchable by names and original IDs', async ({page}) => {
  await page.goto('/asset-viewer/?mode=shenmue2');
  const root = page.locator('#model-list');
  const search = page.locator('#asset-search');
  await expect(root.locator(':scope > details')).toHaveCount(4);
  await search.fill('Phoenix Mirror');
  const matches = root.locator('.model-item:not([data-search-hidden])');
  await expect(matches.first()).toBeVisible();
  await expect(matches.first()).toContainText('PNX02H6G');
  // The readable name spans G/I model variants; the complete filename
  // identifies one catalog record and must still find that same item.
  const filename = await matches.first().getAttribute('title');
  await search.fill(filename);
  await expect(matches).toHaveCount(1);
  await expect(matches.first()).toContainText('Phoenix Mirror');
  await search.fill('Akira 1');
  await expect(matches.first()).toBeVisible();
  await page.screenshot({path:'tests/reports/asset-browser-item-names.png'});
  await search.fill('Q109');
  await expect(matches.first()).toBeVisible();
  await expect(root.getByRole('button', {name: /Thousand White Quarter \(alternate\).*Q109/}).first()).toBeVisible();
});

test('mobile search stays within the sidebar and collapse-all works', async ({page}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/asset-viewer/?mode=shenmue2',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Open asset browser',exact:true}).click();
  await expect(page.locator('#model-list > details')).toHaveCount(4,{timeout:60_000});
  await page.getByLabel('Find a location or asset').fill('bar swing');
  await expect(page.locator('#model-list .model-item:not([data-search-hidden])').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'tests/reports/asset-browser-mobile.png'});
  await page.getByRole('button',{name:'Collapse all',exact:true}).click();
  await expect(page.locator('#model-list details[open]')).toHaveCount(0);
});

test('camera presets belong to the viewer and restore the current interior entrance', async ({page}) => {
  test.skip(Boolean(process.env.E2E_PREVIEW_ORIGIN), 'Camera-coordinate inspection uses the Vite source module');
  test.setTimeout(120_000);
  await page.goto('/asset-viewer/?mode=shenmue2',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#model-list > details')).toHaveCount(4,{timeout:60_000});
  await expect(page.getByText(/models · browse by disc and location/)).toHaveCount(0);
  const controls=page.locator('#canvas-container #viewer-camera-controls');
  await expect(controls).toBeVisible();
  await expect(page.locator('#sidebar #overview-view-btn')).toHaveCount(0);
  await expect(page.locator('#overview-view-btn')).toBeDisabled();
  await page.getByLabel('Find a location or asset').fill('disc 2 bar swing');
  const discTwo = page.locator('#model-list > details').filter({has:page.getByText('Disc 2',{exact:true})});
  await discTwo.locator('.category-group:not([data-search-hidden])').getByRole('button',{name:'Load Area',exact:true}).click();
  const interior=page.locator('#interior-view-btn');
  await expect(interior).toBeEnabled({timeout:60_000});
  const cameraPosition=()=>page.evaluate(async()=>{
    const {default:state}=await import('/src/state.js');
    return state.scene.activeCamera.position.asArray();
  });
  const entrance=await cameraPosition();
  await page.locator('#overview-view-btn').click();
  expect(await cameraPosition()).not.toEqual(entrance);
  await interior.click();
  expect(await cameraPosition()).toEqual(entrance);
  await page.screenshot({path:'tests/reports/asset-viewer-camera-controls.png'});
  await page.getByRole('button',{name:'Shenmue',exact:true}).click();
  await expect(page.locator('#overview-view-btn')).toBeEnabled({timeout:60_000});
  await expect(interior).toBeDisabled();
  await expect(interior).toHaveAttribute('title',/not yet available for Shenmue/);
});
