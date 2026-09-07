import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("player status uses Radix resources beneath a stacked identity", async () => {
  const [component, root, styles] = await Promise.all([
    readFile(
      new URL("../play/ui/react/PlayerStatus.jsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../play/ui/react/UiRoot.jsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../play/styles/base.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(component, /<aside[\s\S]*className="player-status-hud"/);
  assert.match(component, /<Card className="player-status-card"/);
  assert.match(
    component,
    /player-status-name[\s\S]*player-status-location[\s\S]*player-status-time/,
  );
  assert.match(component, /player-status-hp[\s\S]*HP: {health\.current}/);
  assert.match(component, /player-status-level[\s\S]*Level {level}/);
  assert.match(component, /player-status-yen[\s\S]*{money}/);
  const desktopResources = component.match(
    /<Grid className="player-status-resources"[\s\S]*?<\/Grid>/,
  )?.[0] || "";
  assert.doesNotMatch(desktopResources, />\s*(?:Health|Money)\s*</);
  assert.match(component, /toLocaleString\("en-US"\)/);
  assert.match(
    root,
    /\["player-status-ui-root", PlayerStatus, true, true\]/,
  );
  assert.match(
    styles,
    /\.player-status-resources\s*{[^}]*margin-top:\s*14px;/s,
  );
  assert.match(styles, /\.player-status-time\s*{[^}]*font-size:\s*11px;/s);
});
