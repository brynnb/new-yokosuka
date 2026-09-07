import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account creation and the sidebar share the lazy avatar browser", async () => {
  const [app, browser, sidebar, styles] = await Promise.all([
    readFile(
      new URL("../play/account/react/AccountApp.jsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../play/account/react/AvatarBrowserDialog.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../play/ui/react/SidebarApp.jsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../play/styles/account.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(app, /<AvatarBrowserDialog/);
  assert.match(browser, /title = "Browse All Characters"/);
  assert.match(browser, /<LazyCharacterPreview character={character} \/>/);
  assert.match(browser, /motion="walk"[\s\S]*yawDegrees={-25}/);
  assert.match(app, />\s*Browse All\s*<\/AccountButton>/);
  assert.match(
    app,
    /{mobile && \([\s\S]*character-select-create[\s\S]*Create Character/,
  );
  assert.match(browser, /new IntersectionObserver/);
  assert.match(sidebar, />\s*Browse Avatars\s*<\/Button>/);
  assert.match(sidebar, /<AvatarBrowserDialog[\s\S]*dark/);
  assert.match(
    sidebar,
    /<AvatarBrowserDialog[\s\S]*onCloseAutoFocus={focusGameAfterSidebarSelect}/,
  );
  assert.match(
    browser,
    /<Dialog\.Content[\s\S]*onCloseAutoFocus={onCloseAutoFocus}/,
  );
  assert.match(
    styles,
    /\.avatar-browser-grid\s*{[^}]*repeat\(4, minmax\(0, 1fr\)\)/s,
  );
  assert.match(
    styles,
    /\.avatar-browser-card\.rt-Button::after\s*{\s*display:\s*none/s,
  );
  assert.match(
    styles,
    /\.character-model-picker\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s,
  );
  assert.match(
    app,
    /character-model-arrow[\s\S]*character-carousel-arrow[\s\S]*account-button-big[\s\S]*aria-label="Previous character"[\s\S]*<ChevronIcon direction="left" \/>/,
  );
});
