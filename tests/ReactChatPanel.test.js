import assert from "node:assert/strict";
import test from "node:test";

import { ReactChatPanel } from "../play/multiplayer/ReactChatPanel.js";
import {
  chatViewState,
  useChatUiStore,
} from "../play/ui/react/chatStore.js";

test("React chat controller publishes connection and bounded message state", () => {
  useChatUiStore.setState({
    connectionState: "offline",
    identity: null,
    playerCount: 0,
    onlinePlayers: [],
    playerDirectoryOpen: false,
    playerDirectoryStatus: "idle",
    messages: [],
  });
  let directoryRequests = 0;
  const chat = new ReactChatPanel({
    onSend: () => true,
    onPlayerDirectoryRequest: () => {
      directoryRequests += 1;
      return true;
    },
  });

  chat.setIdentity({ name: "Akira" });
  chat.setPlayerCount(2);
  chat.setConnected(true);
  chat.addMessage({ name: "Nozomi", text: "Hello" });
  chat.addSystem("Welcome");
  assert.equal(chat.requestPlayerDirectory(), true);
  chat.setPlayerDirectory([{
    id: "one",
    name: "Akira",
    worldId: "dobuita",
    location: "Dobuita",
  }]);

  const state = useChatUiStore.getState();
  assert.deepEqual(chatViewState(state), {
    connected: true,
    title: "Online Chat - Chatting as Akira",
    status: "Online - 2 players",
  });
  assert.deepEqual(
    state.messages.map(({ type, text }) => ({ type, text })),
    [
      { type: "chat", text: "Hello" },
      { type: "system", text: "Welcome" },
    ],
  );
  assert.equal(directoryRequests, 1);
  assert.deepEqual(state.onlinePlayers, [{
    id: "one",
    name: "Akira",
    worldId: "dobuita",
    location: "Dobuita",
  }]);
  assert.equal(state.playerDirectoryStatus, "ready");

  chat.setConnected(false);
  assert.deepEqual(useChatUiStore.getState().onlinePlayers, []);
  assert.equal(useChatUiStore.getState().playerDirectoryStatus, "offline");
});

test("world entry replays chat history before its welcome message", () => {
  useChatUiStore.setState({
    messages: [{ id: "stale", type: "system", text: "Stale" }],
  });
  const chat = new ReactChatPanel({ onSend: () => true });

  chat.beginWorldSession([
    { name: "Nozomi", text: "First" },
    { name: "Tom", text: "Second" },
  ]);

  assert.deepEqual(
    useChatUiStore.getState().messages.map(({ type, text }) => ({ type, text })),
    [
      { type: "chat", text: "First" },
      { type: "chat", text: "Second" },
      { type: "system", text: "Welcome to New Yokosuka!" },
    ],
  );
});
