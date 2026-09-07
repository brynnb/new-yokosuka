import assert from "node:assert/strict";
import test from "node:test";

import {
  multiplayerStatusText,
  onlineChatTitle,
  onlinePlayerStatus,
  zoneEntryMessage,
} from "../src/multiplayer/ChatText.js";

test("formats connected-player counts with singular and plural labels", () => {
  assert.equal(onlinePlayerStatus(1), "Online - 1 player");
  assert.equal(onlinePlayerStatus(2), "Online - 2 players");
  assert.equal(onlinePlayerStatus(27), "Online - 27 players");
});

test("never presents a connected room as having zero players", () => {
  assert.equal(onlinePlayerStatus(0), "Online - 1 player");
  assert.equal(onlinePlayerStatus(Number.NaN), "Online - 1 player");
});

test("distinguishes connection attempts from an offline server", () => {
  assert.equal(multiplayerStatusText("connecting", 0), "Connecting");
  assert.equal(multiplayerStatusText("offline", 0), "Server Offline");
  assert.equal(multiplayerStatusText("connected", 2), "Online - 2 players");
});

test("formats zone-entry system messages", () => {
  assert.equal(
    zoneEntryMessage("Guest890384983", "Sakuragaoka"),
    "Guest890384983 has entered Sakuragaoka",
  );
  assert.equal(
    zoneEntryMessage("Guest4251", "Yamanose", "Guest4251"),
    "You have entered Yamanose",
  );
});

test("labels online chat with the current identity", () => {
  assert.equal(
    onlineChatTitle("Username3244"),
    "Online Chat - Chatting as Username3244",
  );
  assert.equal(onlineChatTitle(null), "Online Chat");
});
