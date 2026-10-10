import {expect, test} from '@playwright/test';

test.use({viewport: {width: 844, height: 390}, hasTouch: true});

test('mobile cutscene controls replace gameplay input, seek and skip, then restore gameplay', async ({page}, testInfo) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('new-yokosuka.quick-play-confirmations.v1', '3');
    window.mobileCutsceneTest = {ready: false, errors: [], seeks: [], results: []};
  });
  await page.route('**/api/status', route => route.fulfill({json: {}}));
  await page.route('**/api/auth/guest', route => route.fulfill({json: {account: {id: 1, accountType: 'guest'}}}));
  await page.route('**/api/world-state', route => route.fulfill({json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  }}));
  await page.route('**/api/characters', route => route.fulfill({json: {characters: [{
    id: 42, name: 'Mobiletester', avatarId: 'fuku', worldId: 'dobuita',
    lastLoginAt: '2026-01-01T00:00:00Z', x: -24.5, y: 0, z: 29.5, yaw: 0.7,
  }]}}));
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: `${await response.text()}\n${body}`});
  });
  await instrument('play/ui/MobileControls.js', `
    const initializeMobile = MobileControls.prototype.initialize;
    MobileControls.prototype.initialize = function(...args) {
      window.mobileCutsceneTest.mobile = this;
      return initializeMobile.apply(this, args);
    };
  `);
  await instrument('play/cutscenes/CutscenePreviewRuntime.js', `
    const requestMobilePreview = CutscenePreviewRuntime.prototype.requestInGame;
    CutscenePreviewRuntime.prototype.requestInGame = async function(id) {
      window.mobileCutsceneTest.preview = this;
      const result = await requestMobilePreview.call(this, id);
      window.mobileCutsceneTest.results.push(result);
      return result;
    };
  `);
  await instrument('play/cutscenes/NativeCutsceneDirector.js', `
    const seekMobileCutscene = NativeCutsceneDirector.prototype.seekBySeconds;
    NativeCutsceneDirector.prototype.seekBySeconds = function(seconds) {
      window.mobileCutsceneTest.seeks.push(seconds);
      return seekMobileCutscene.call(this, seconds);
    };
  `);
  await instrument('play/multiplayer/MultiplayerSession.js', `
    MultiplayerSession.prototype.connect = function() {};
  `);
  await page.route('**/play/play.js*', route => route.fulfill({contentType: 'application/javascript', body: `
    import {PlayApplication} from '/play/PlayApplication.js';
    const probe = window.mobileCutsceneTest;
    probe.application = new PlayApplication();
    probe.application.start().then(() => {probe.ready = true;}).catch(error => {
      probe.errors.push(error.message);
      probe.application.showStartupError(error);
    });
  `}));
  await page.goto('/play/');
  await page.locator('.account-intro-prompt').waitFor();
  await page.keyboard.press('Enter');
  await page.locator('.account-entry-actions button').filter({hasText: 'Quick Play'}).click();
  await page.locator('.account-shell-characters button').filter({hasText: /^Enter World$/}).click();
  await page.waitForFunction(() => window.mobileCutsceneTest.ready || window.mobileCutsceneTest.errors.length, null, {timeout: 90_000});
  expect(await page.evaluate(() => window.mobileCutsceneTest.errors)).toEqual([]);
  await expect(page.locator('#mobile-joystick-zone')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Skip cutscene', exact: true})).toBeHidden();
  // The menu is collapsed on phones; use the real sidebar action to start.
  await page.locator('#sidebar-toggle').click();
  await page.locator('#cutscene-button').click();
  await page.getByRole('option', {name: /Ine-san Collects the Mail/}).click();
  await expect(page.locator('body')).toHaveClass(/cutscene-starting/);
  await expect(page.locator('#mobile-joystick-zone')).toBeHidden();
  await expect(page.getByRole('button', {name: 'Skip cutscene', exact: true})).toBeHidden();
  await page.waitForFunction(() => window.mobileCutsceneTest.preview?.active?.started, null, {timeout: 90_000});
  await expect(page.locator('body')).not.toHaveClass(/cutscene-starting/);
  await testInfo.attach('cutscene-ui-state', {contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => {
    const button = document.getElementById('mobile-cutscene-skip');
    const ancestors = [];
    for (let element = button; element; element = element.parentElement) {
      ancestors.push({tag: element.tagName, id: element.id, class: element.className,
        ariaHidden: element.getAttribute('aria-hidden'), inert: element.inert,
        pointerEvents: getComputedStyle(element).pointerEvents, display: getComputedStyle(element).display});
    }
    return {ancestors, dialogs: [...document.querySelectorAll('[role="dialog"], [role="listbox"]')]
      .map(element => ({id: element.id, state: element.getAttribute('data-state')}))};
  }), null, 2)});
  // Existing force-mounted Settings Dialog.Content applies aria-hidden to
  // gameplay even while closed. Do not bypass pointer/focus checks or erase
  // that attribute to disguise it: verify actual touch operation here and
  // retain the diagnostic attachment for that separate modal-lifecycle bug.
  const skip = page.getByRole('button', {name: 'Skip cutscene', exact: true, includeHidden: true});
  await expect(skip).toBeVisible();
  for (const selector of ['#mobile-joystick-zone', '#mobile-chat-toggle', '#sidebar-toggle', '#dialogue-controls-hud']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  expect(await page.evaluate(() => window.mobileCutsceneTest.mobile.joystick)).toBeNull();
  await page.getByRole('button', {name: 'Skip forward five seconds', includeHidden: true}).tap();
  expect(await page.evaluate(() => window.mobileCutsceneTest.seeks)).toEqual([5]);
  await page.screenshot({path: testInfo.outputPath('mobile-cutscene.png')});
  // Desktop keeps the original keyboard hints, with no touch buttons.
  await page.setViewportSize({width: 1280, height: 720});
  await expect(skip).toBeHidden();
  await expect(page.locator('#dialogue-controls-hud')).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  await expect(skip).toBeVisible();
  expect(await page.evaluate(() => window.mobileCutsceneTest.mobile.joystick)).toBeNull();
  await skip.tap();
  await page.waitForFunction(() => window.mobileCutsceneTest.results.length === 1, null, {timeout: 60_000});
  expect(await page.evaluate(() => window.mobileCutsceneTest.results)).toEqual([true]);
  await expect(page.locator('body')).not.toHaveClass(/cutscene-active|cutscene-starting/);
  await expect(skip).toBeHidden();
  await expect(page.locator('#mobile-joystick-zone')).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.mobileCutsceneTest.mobile.joystick))).toBe(true);
  await page.screenshot({path: testInfo.outputPath('mobile-returned.png')});
  expect(errors).toEqual([]);
  await page.evaluate(() => window.mobileCutsceneTest.application.dispose());
});
