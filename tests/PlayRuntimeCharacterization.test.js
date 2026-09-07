import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playSource = readFileSync(
  new URL("../play/PlayApplication.js", import.meta.url),
  "utf8",
);

function sourceBetween(start, end) {
  const startIndex = playSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = playSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return playSource.slice(startIndex, endIndex);
}

function assertOrdered(source, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, cursor + 1);
    assert.notEqual(index, -1, `missing ordered marker: ${marker}`);
    assert.ok(index > cursor, `${marker} must follow the previous stage`);
    cursor = index;
  }
}

test("runtime disposal preserves resource teardown order", () => {
  const source = sourceBetween(
    "function disposeRuntime",
    "function updateRenderFrame",
  );
  assertOrdered(source, [
    "persistPlayerLocation()",
    "interfaceRuntime.dispose()",
    "multiplayerRuntime.dispose()",
    "playerRuntime.dispose()",
    "poolRuntime.dispose()",
    "worldSounds.reset",
    "mobileControls.dispose()",
    "loadingScreen.dispose()",
    "nativeCutsceneDirector.dispose()",
    "ambientDirector.dispose()",
    "sceneRuntime.dispose()",
    "arcadeAudioControls.dispose()",
    "dialogueAudio.dispose()",
    "scriptEventController.reset",
    "transientNotice.dispose()",
    "worldEnvironment.dispose()",
  ]);
});
