import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the entry menu covers the game immediately without a loading panel", async () => {
  const html = await readFile(
    new URL("../play/index.html", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../play/styles/account.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /<body class="account-pending">/);
  assert.match(
    html,
    /id="account-ui-root" class="account-ui-booting"/,
  );
  assert.match(html, /id="react-ui-root"/);
  assert.match(html, /src="\.\/ui\/react\/main\.jsx"/);
  assert.match(
    html,
    /<span class="account-kicker">Checking Server\.\.\.<\/span>/,
  );
  assert.match(styles, /\.account-kicker\.offline\s*{[^}]*color:\s*#f08c84;/s);
  assert.match(html, /<h1>Welcome to New Yokosuka<\/h1>/);
  assert.doesNotMatch(html, /Checking your saved session/);
  assert.match(
    styles,
    /\.account-pending \.app\s*{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    styles,
    /\.account-pending \.viewport > :not\(#renderCanvas\)/,
  );
  assert.match(
    styles,
    /\.account-pending,\s*\.account-pending \.viewport\s*{\s*background:\s*#24262b;/,
  );
  assert.match(
    styles,
    /\.account-pending\.menu-scene-ready #renderCanvas\s*{\s*opacity:\s*1;/,
  );
  assert.match(
    styles,
    /\.account-ui-booting \.account-gate\s*{\s*visibility:\s*hidden;/,
  );
  assert.doesNotMatch(styles, /shenmue-menu\/background\.png/);
});
