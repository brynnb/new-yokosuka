import assert from "node:assert/strict";
import test from "node:test";

import {
  MULTIPLAYER_PROTOCOL_VERSION,
  MultiplayerClient,
} from "../src/multiplayer/MultiplayerClient.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor() {
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }
}

function connectClient() {
  const client = new MultiplayerClient({
    url: "ws://test/ws",
    WebSocketClass: FakeWebSocket,
  });
  client.connect();
  const socket = client.socket;
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "welcome",
      self: { id: "player-1" },
      worldState: {},
      connectedClients: 1,
    }),
  });
  return { client, socket };
}

test("client requests and commits a server transition authorization", async () => {
  const { client, socket } = connectClient();
  const transition = {
    id: "d000-door-30-to-dcha-entry-0",
    source: { worldId: "dobuita", doorSelector: 30 },
    destination: { worldId: "dcha" },
  };
  const authorizationPromise = client.requestTransition(
    transition,
    "request-1",
  );
  assert.deepEqual(socket.sent.at(-1), {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type: "transition_request",
    requestId: "request-1",
    transitionId: transition.id,
    doorSelector: 30,
    sourceWorldId: "dobuita",
    destinationWorldId: "dcha",
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "transition_result",
      requestId: "request-1",
      authorized: true,
      authorizationId: "grant-1",
      reason: "authorized",
    }),
  });
  const authorization = await authorizationPromise;
  assert.equal(authorization.authorizationId, "grant-1");

  const commitPromise = client.commitTransition(authorization);
  assert.deepEqual(socket.sent.at(-1), {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type: "transition_commit",
    requestId: "request-1",
    authorizationId: "grant-1",
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "transition_commit_result",
      requestId: "request-1",
      committed: true,
      reason: "committed",
    }),
  });
  assert.equal((await commitPromise).committed, true);
  assert.equal(client.pendingTransitions.size, 0);
  assert.equal(client.pendingTransitionCommits.size, 0);
  client.close();
});

test("connection loss rejects an uncommitted transition request", async () => {
  const { client } = connectClient();
  const pending = client.requestTransition({
    id: "d000-door-30-to-dcha-entry-0",
    source: { worldId: "dobuita", doorSelector: 30 },
    destination: { worldId: "dcha" },
  }, "request-lost");
  client.close();
  await assert.rejects(pending, /connection was lost/);
  assert.equal(client.pendingTransitions.size, 0);
});
