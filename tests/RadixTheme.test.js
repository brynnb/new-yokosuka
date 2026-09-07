import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the shared Radix theme owns the New Yokosuka palette", async () => {
  const [component, styles, account, settings] = await Promise.all([
    readFile(
      new URL(
        "../play/ui/react/NewYokosukaTheme.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../play/styles/radix-theme.css", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../play/account/react/AccountApp.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../play/ui/react/SettingsApp.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    component,
    /screen === "closed" \? "dark" : "light"/,
  );
  assert.match(component, /appearance={appearance}/);
  assert.match(component, /accentColor:\s*"teal"/);
  assert.match(component, /panelBackground:\s*"translucent"/);
  assert.match(styles, /--ny-accent:\s*#67d9e8/);
  assert.match(
    styles,
    /--card-background-color:\s*rgb\(238 246 247 \/ 0\.6\)/,
  );
  assert.match(
    styles,
    /\.account-shell-radix\.account-shell-entry\s*{[^}]*height:\s*400px;/s,
  );
  assert.match(
    styles,
    /\.new-yokosuka-theme\.radix-themes\[data-is-root-theme="true"\][^{]*{[^}]*min-height:\s*0;/s,
  );
  assert.match(account, /<Card asChild size="4" variant="surface">/);
  assert.match(account, /<Button[\s\S]*variant="classic"/);
  assert.match(account, /"character-slot-button"/);
  assert.match(
    styles,
    /\.character-slot-button\.rt-Button\s*{[^}]*height:\s*100%;/s,
  );
  assert.match(styles, /--ny-layer-dialog:\s*10020/);
  assert.match(styles, /--ny-layer-floating-control:\s*10030/);
  assert.match(
    styles,
    /\.rt-PopperContent,\s*\.rt-SelectContent\s*{[^}]*z-index:\s*var\(--ny-layer-floating-control\)/s,
  );
  assert.match(account, /radixCard = true/);
  assert.match(
    settings,
    /<Box display={{ initial: "block", sm: "none" }}>/,
  );
  assert.match(settings, /id="settings-section-select"/);
  assert.match(
    settings,
    /id="settings-reset"[\s\S]*className="ny-button-light"/,
  );
  assert.match(
    settings,
    /id="settings-done"[\s\S]*className="ny-button-primary"/,
  );
  assert.match(settings, /<Dialog\.Content[\s\S]{0,160}\bforceMount\b/);
  assert.match(
    styles,
    /\.ny-button-light\.rt-Button\s*,[\s\S]*--accent-9:\s*#fff;/,
  );
  assert.match(
    styles,
    /\.ny-button-primary\.rt-Button\s*{[^}]*#67d9e8/s,
  );
  assert.match(settings, /<Select\.Item value={tab} key={tab}>/);
  assert.match(
    settings,
    /<Box display={{ initial: "none", sm: "block" }}>/,
  );
});
