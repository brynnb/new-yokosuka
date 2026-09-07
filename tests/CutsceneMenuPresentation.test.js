import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountApp = readFileSync(
  new URL("../play/account/react/AccountApp.jsx", import.meta.url),
  "utf8",
);
const accountCss = readFileSync(
  new URL("../play/styles/account.css", import.meta.url),
  "utf8",
);

test("cutscene rows are plain elements sharing the effective detail surface", () => {
  assert.match(
    accountApp,
    /CUTSCENES\.map\(\(cutscene\) => \(\s*<div\s+className=/,
  );
  assert.doesNotMatch(
    accountApp,
    /"cutscene-list-item",\s*"cutscene-art-surface"/,
  );
  assert.match(
    accountApp,
    /className="cutscene-list"[\s\S]{0,180}onWheel=\{\(event\) => event\.stopPropagation\(\)\}/,
    "the cutscene list must keep wheel input away from the force-mounted settings dialog",
  );
  assert.match(
    accountApp,
    /className="cutscene-detail-art cutscene-art-surface"/,
  );
  const radixTheme = readFileSync(
    new URL("../play/styles/radix-theme.css", import.meta.url),
    "utf8",
  );
  assert.match(
    radixTheme,
    /\.account-shell-radix \.character-detail,\s*\.account-shell-radix \.cutscene-list-item\s*{[^}]*rgb\(255 255 255 \/ 0\.62\)/s,
  );
  assert.match(
    radixTheme,
    /\.account-shell-radix \.cutscene-list-item\.selected\s*{[^}]*linear-gradient\(90deg[^}]*box-shadow: 0 0 0 3px/s,
  );
  assert.doesNotMatch(radixTheme, /cutscene-list-item\.selected[^}]*inset/s);
  assert.doesNotMatch(accountCss, /\.cutscene-list-item\.rt-Button/);
});
