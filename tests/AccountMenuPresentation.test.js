import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account menu and Babylon wordmark share one fade duration", async () => {
  const [presentation, styles] = await Promise.all([
    readFile(
      new URL(
        "../play/account/AccountMenuPresentation.js",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../play/styles/account.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(presentation, /ACCOUNT_MENU_FADE_SECONDS = 0\.18/);
  assert.match(styles, /account-shell-reveal 180ms ease-out/);
});
