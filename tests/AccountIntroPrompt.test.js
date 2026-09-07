import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the intro prompt precedes the welcome card", async () => {
  const [component, styles] = await Promise.all([
    readFile(
      new URL(
        "../play/account/react/AccountApp.jsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../play/styles/account.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(component, /<p>Press Any Key<\/p>/);
  assert.match(component, /window\.addEventListener\("keydown"/);
  assert.match(component, /window\.addEventListener\("pointerdown"/);
  assert.match(component, /screen === "entry" && !introAccepted/);
  assert.match(component, /setAccountMenuVisible\(true\)/);
  assert.match(component, /setAccountMenuVisible\(false\)/);
  assert.match(component, /if \(event\.key !== "Escape"\) return/);
  assert.match(
    component,
    /window\.addEventListener\("keydown", closeOnEscape, true\)/,
  );
  assert.match(component, /if \(settingsOpen\) return/);
  assert.match(component, /setIntroAccepted\(false\)/);
  assert.match(styles, /account-intro-appear 2s ease-out both/);
  assert.match(styles, /account-intro-pulse 1\.8s ease-in-out 2s infinite/);
  assert.match(styles, /\.account-shell-reveal\s*{/);
});
