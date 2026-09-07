import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile cinema seating replaces the joystick with a stand action", async () => {
  const [html, controls, play, styles] = await Promise.all([
    readFile(new URL("../play/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../play/ui/MobileControls.js", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../play/PlayApplication.js", import.meta.url), "utf8"),
    readFile(new URL("../play/styles/mobile.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="mobile-cinema-stand"[\s\S]*>\s*Stand\s*</);
  assert.match(controls, /setCinemaSeated\(active\)/);
  assert.match(controls, /this\.cinemaSeated[\s\S]*this\.destroyJoystick\(\)/);
  assert.match(controls, /this\.exitCinemaSeat\?\.\(\)/);
  assert.match(play, /onActiveChanged:[\s\S]*mobileControls\.setCinemaSeated\(active\)/);
  assert.match(styles, /\.app\.cinema-seated \.mobile-joystick-zone\s*{[^}]*display:\s*none;/s);
  assert.match(styles, /\.app\.cinema-seated \.mobile-cinema-stand\s*{[^}]*display:\s*inline-flex;/s);
});
