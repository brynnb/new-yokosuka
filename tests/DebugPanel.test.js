import assert from "node:assert/strict";
import test from "node:test";
import { DebugPanel } from "../play/ui/DebugPanel.js";

function debugValue() {
  const classes = new Set();
  return {
    textContent: "",
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}

test("debug panel exposes arcade performance fallback and media state", () => {
  const dom = {
    debugArcadeMode: debugValue(),
    debugArcadeFps: debugValue(),
    debugArcadeVideos: debugValue(),
    debugArcadeLights: debugValue(),
    debugArcadeScreens: debugValue(),
    debugArcadeReason: debugValue(),
  };
  const panel = new DebugPanel({ dom, enabled: true });

  panel.updateArcadePerformance({
    active: true,
    levelName: "Static screens",
    videosEnabled: false,
    lightsEnabled: true,
    lastFps: 19.96,
    lastReason: "disable-videos",
  }, {
    videoCount: 6,
    readyVideoCount: 1,
    playingVideoCount: 0,
    blockedVideoCount: 5,
  });

  assert.equal(dom.debugArcadeMode.textContent, "Static screens");
  assert.equal(dom.debugArcadeFps.textContent, "20.0");
  assert.equal(dom.debugArcadeVideos.textContent, "PAUSED (LOW FPS)");
  assert.equal(
    dom.debugArcadeVideos.classList.contains("debug-performance-disabled"),
    true,
  );
  assert.equal(dom.debugArcadeLights.textContent, "On");
  assert.equal(
    dom.debugArcadeScreens.textContent,
    "1/6 ready · 0 playing · 5 blocked",
  );
  assert.equal(dom.debugArcadeReason.textContent, "disable-videos");
});

test("debug panel shows local cutscene transport state", () => {
  const attributes = new Map();
  const button = () => ({
    disabled: false,
    textContent: "",
    setAttribute: (name, value) => attributes.set(name, value),
  });
  const dom = {
    debugCutsceneTransport: { hidden: true },
    debugCutscenePosition: { textContent: "" },
    debugCutsceneBack60: button(),
    debugCutsceneBack15: button(),
    debugCutsceneBack: button(),
    debugCutscenePause: button(),
    debugCutsceneForward: button(),
    debugCutsceneForward15: button(),
    debugCutsceneForward60: button(),
  };
  const panel = new DebugPanel({ dom, enabled: true });

  panel.updateCutsceneTransport({
    active: true,
    paused: true,
    seeking: false,
    trackIndex: 3,
    elapsedSeconds: 65.27,
    durationSeconds: 354.7,
  });
  assert.equal(dom.debugCutsceneTransport.hidden, false);
  assert.equal(
    dom.debugCutscenePosition.textContent,
    "Track 03 · 01:05.2 / 05:54.7",
  );
  assert.equal(dom.debugCutscenePause.textContent, "Resume");
  assert.equal(attributes.get("aria-pressed"), "true");

  panel.updateCutsceneTransport({ active: false });
  assert.equal(dom.debugCutsceneTransport.hidden, true);
});
