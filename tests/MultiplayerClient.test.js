import assert from "node:assert/strict";
import test from "node:test";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  MultiplayerClient,
  multiplayerHttpUrl,
  multiplayerUrl,
  normalizeLocalPresence,
  presenceChanged,
  priorityPresenceChanged,
} from "../src/multiplayer/MultiplayerClient.js";
import {
  interpolationAlpha,
  shortestAngleDelta,
  shouldSnapPosition,
} from "../src/multiplayer/interpolation.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
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
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("not open");
    this.sent.push(JSON.parse(payload));
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }
}

function localState(overrides = {}) {
  return {
    worldId: "dobuita",
    characterId: "ryo",
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.5,
    movement: "idle",
    animationId: null,
    animationRevision: 0,
    ...overrides,
  };
}

test("multiplayer URL follows page security and supports overrides", () => {
  assert.equal(
    multiplayerUrl({ protocol: "https:", host: "example.com" }),
    "wss://example.com/ws",
  );
  assert.equal(
    multiplayerUrl(
      { protocol: "http:", host: "localhost:5173" },
      "ws://localhost:8080/ws",
    ),
    "ws://localhost:8080/ws",
  );
  assert.equal(
    multiplayerHttpUrl(
      "wss://multiplayer.example.com/ws",
      "/api/guests/player/name",
    ),
    "https://multiplayer.example.com/api/guests/player/name",
  );
});

test("presence normalization and diffing cover visual state", () => {
  assert.equal(normalizeLocalPresence({}), null);
  const first = normalizeLocalPresence(localState());
  assert.equal(presenceChanged(first, { ...first }), false);
  assert.equal(
    presenceChanged(
      normalizeLocalPresence(localState({ characterId: "ine" })),
      first,
    ),
    true,
  );
  assert.equal(
    presenceChanged(
      normalizeLocalPresence(localState({
        animationId: "bow",
        animationRevision: 1,
      })),
      first,
    ),
    true,
  );
  assert.equal(
    priorityPresenceChanged(
      normalizeLocalPresence(localState({ movement: "run" })),
      first,
    ),
    true,
  );
  const forklift = normalizeLocalPresence(localState({
    vehicleId: "forklift-3",
    vehicleLift: 1.25,
    vehicleSteering: -0.2,
    vehicleWheelRoll: 9,
    vehicleQx: 0.1,
    vehicleQy: 0.2,
    vehicleQz: 0.3,
    vehicleQw: 0.9,
  }));
  assert.equal(forklift.vehicleId, "forklift-3");
  assert.equal(forklift.vehicleLift, 1.25);
  assert.ok(Math.abs(Math.hypot(
    forklift.vehicleQx,
    forklift.vehicleQy,
    forklift.vehicleQz,
    forklift.vehicleQw,
  ) - 1) < 1e-12);
  assert.equal(priorityPresenceChanged(forklift, first), true);
  assert.equal(
    normalizeLocalPresence(localState({ vehicleId: "forklift-99" }))
      .vehicleId,
    null,
  );
  assert.equal(
    normalizeLocalPresence(localState({
      vehicleId: "forklift-abcdef123456",
    })).vehicleId,
    "forklift-abcdef123456",
  );
  assert.equal(
    normalizeLocalPresence(localState({
      vehicleId: "forklift-15",
    })).vehicleId,
    "forklift-15",
  );
});

test("presence normalization preserves backpedaling and directional turns", () => {
  for (const movement of ["backpedal", "turnLeft", "turnRight"]) {
    assert.equal(normalizeLocalPresence(localState({ movement })).movement, movement);
  }
});

test("client receives and revision-saves native dialogue state", async () => {
  FakeWebSocket.instances.length = 0;
  const dialogueState = {
    schema: "new-yokosuka-native-dialogue-snapshot-v1",
    revision: 7,
  };
  let welcomedDialogue = null;
  let welcomedChatHistory = null;
  let savedRequest = null;
  const client = new MultiplayerClient({
    url: "wss://test.example/ws",
    characterId: 42,
    WebSocketClass: FakeWebSocket,
    fetchImpl: async (url, options) => {
      savedRequest = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { ...dialogueState, revision: 8 };
        },
      };
    },
    callbacks: {
      onWelcome: (
        _identity,
        _world,
        _count,
        _character,
        _inventory,
        snapshot,
        history,
      ) => {
        welcomedDialogue = snapshot;
        welcomedChatHistory = history;
      },
    },
  });
  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "welcome",
      self: { id: "one", characterId: 42 },
      worldState: {},
      connectedClients: 1,
      dialogueState,
      chatHistory: [{ name: "Nozomi", text: "Hi Ryo" }],
    }),
  });
  assert.deepEqual(welcomedDialogue, dialogueState);
  assert.deepEqual(welcomedChatHistory, [
    { name: "Nozomi", text: "Hi Ryo" },
  ]);

  const saved = await client.saveDialogueState(dialogueState);
  assert.equal(saved.revision, 8);
  assert.equal(
    savedRequest.url,
    "https://test.example/api/characters/42/dialogue",
  );
  assert.equal(savedRequest.options.method, "PUT");
  assert.equal(savedRequest.options.credentials, "include");
  assert.deepEqual(JSON.parse(savedRequest.options.body), dialogueState);
});

test("dialogue save surfaces optimistic revision conflicts", async () => {
  const dialogueState = {
    schema: "new-yokosuka-native-dialogue-snapshot-v1",
    revision: 3,
  };
  const client = new MultiplayerClient({
    url: "ws://test/ws",
    WebSocketClass: FakeWebSocket,
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      async json() {
        return {
          error: "dialogue state revision conflict",
          dialogueState,
        };
      },
    }),
  });
  client.identity = { characterId: 9 };
  await assert.rejects(client.saveDialogueState({ revision: 2 }), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /revision conflict/);
    assert.deepEqual(error.dialogueState, dialogueState);
    return true;
  });
});

test("client welcomes, sends presence and chat", async () => {
  FakeWebSocket.instances.length = 0;
  let now = 0;
  const snapshots = [];
  const chats = [];
  const systemMessages = [];
  const arcadeHighScores = [];
  const clientCounts = [];
  const playerDirectories = [];
  const playerEntries = [];
  const cargoEvents = [];
  const removedCargo = [];
  const npcStates = [];
  const removedNpcs = [];
  const forkliftSounds = [];
  const requests = [];
  const client = new MultiplayerClient({
    url: "ws://test/ws",
    WebSocketClass: FakeWebSocket,
    now: () => now,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { id: "one", name: "Tom" };
        },
      };
    },
    callbacks: {
      onSnapshot: (players, forklifts, cargo, npcs) => snapshots.push({
        players,
        forklifts,
        cargo,
        npcs,
      }),
      onChat: (message) => chats.push(message),
      onSystemMessage: (message) => systemMessages.push(message),
      onArcadeHighScore: (score) => arcadeHighScores.push(score),
      onClientCount: (count) => clientCounts.push(count),
      onPlayerDirectory: (players) => playerDirectories.push(players),
      onPlayerEntered: (player) => playerEntries.push(player),
      onCargoState: (cargo) => cargoEvents.push(cargo),
      onCargoRemoved: (cargoId) => removedCargo.push(cargoId),
      onNPCState: (npc) => npcStates.push(npc),
      onNPCRemoved: (npcId) => removedNpcs.push(npcId),
      onForkliftSound: (event) => forkliftSounds.push(event),
    },
  });
  assert.equal(client.setLocalPresence(localState()), false);
  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "welcome",
      self: {
        id: "one",
        name: "Guest1001",
      },
      worldState: {},
      connectedClients: 1,
    }),
  });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, "presence");
  assert.equal(socket.sent[0].sequence, 1);

  now = 1;
  assert.equal(
    client.setLocalPresence(localState({ movement: "run" })),
    true,
  );
  now = 2;
  assert.equal(client.setLocalPresence(localState()), true);

  now = 100;
  assert.equal(
    client.setLocalPresence(localState({ x: 1.5 })),
    false,
  );
  now = 210;
  assert.equal(
    client.setLocalPresence(localState({ x: 1.5 })),
    true,
  );
  assert.equal(socket.sent.at(-1).sequence, 4);

  now = 211;
  assert.equal(client.setLocalPresence(localState({
    x: 1.5,
    animationId: "bow",
    animationRevision: 1,
  })), true);
  assert.equal(socket.sent.at(-1).animationId, "bow");

  assert.equal(client.sendForkliftUpdate({
    id: "forklift-2",
    x: 1,
    y: 0,
    z: 2,
    yaw: 3,
    lift: 0.5,
    steering: 0.1,
    wheelRoll: 4,
    qx: 0.1,
    qy: 0.2,
    qz: 0.3,
    qw: 0.9,
    velocityX: 1.5,
    velocityY: -0.25,
    velocityZ: 2.5,
    angularVelocityX: 0.1,
    angularVelocityY: 0.2,
    angularVelocityZ: 0.3,
    righting: true,
  }, { release: true }), true);
  assert.equal(socket.sent.at(-1).type, "forklift_update");
  assert.equal(socket.sent.at(-1).release, true);
  assert.equal(socket.sent.at(-1).righting, true);
  assert.equal(socket.sent.at(-1).velocityX, 1.5);
  assert.equal(socket.sent.at(-1).angularVelocityZ, 0.3);
  assert.ok(Math.abs(Math.hypot(
    socket.sent.at(-1).qx,
    socket.sent.at(-1).qy,
    socket.sent.at(-1).qz,
    socket.sent.at(-1).qw,
  ) - 1) < 1e-12);
  assert.equal(client.sendForkliftSound("forklift-2", "horn"), true);
  assert.deepEqual(socket.sent.at(-1), {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type: "forklift_sound",
    forkliftId: "forklift-2",
    cue: "horn",
  });
  assert.equal(
    client.sendForkliftSound("forklift-2", "startup"),
    false,
  );
  assert.equal(client.spawnForklift({
    x: 4,
    y: 0,
    z: 8,
    yaw: 1,
  }), true);
  assert.equal(socket.sent.at(-1).type, "forklift_spawn");
  assert.equal(client.claimCargo("cargo-job-1"), true);
  assert.equal(socket.sent.at(-1).type, "cargo_claim");
  assert.equal(client.sendCargoUpdate({
    id: "cargo-job-1",
    x: 3,
    y: 1,
    z: 4,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    velocityX: 1,
    velocityY: 2,
    velocityZ: 3,
    angularVelocityX: 0.1,
    angularVelocityY: 0.2,
    angularVelocityZ: 0.3,
    sleeping: false,
  }, { touching: false }), true);
  assert.equal(socket.sent.at(-1).type, "cargo_update");
  assert.equal(socket.sent.at(-1).touching, false);
  assert.equal(client.sendChat("hello"), true);
  assert.equal(socket.sent.at(-1).type, "chat");
  assert.equal(client.requestPlayerDirectory(), true);
  assert.deepEqual(socket.sent.at(-1), {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type: "player_directory_request",
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "forklift_sound",
      forkliftId: "forklift-2",
      cue: "flip_impact",
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "snapshot",
      players: [{ id: "two" }],
      forklifts: [{ id: "forklift-1" }],
      cargo: [{ id: "cargo-job-1" }],
      npcs: [{ id: "ITOH:adb3e19e82a8", revision: 4 }],
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "npc_state",
      npc: { id: "ITOH:adb3e19e82a8", revision: 5 },
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "npc_removed",
      npcId: "old-npc",
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "cargo_state",
      cargo: { id: "cargo-job-1", ownerId: "one" },
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "cargo_removed",
      cargoId: "cargo-job-old",
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "client_count",
      connectedClients: 2,
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "player_directory",
      players: [
        { id: "one", name: "Guest1001", worldId: "dobuita" },
        { id: "two", name: "Guest1002", worldId: "yamanose" },
      ],
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "player_entered",
      playerId: "two",
      name: "Guest1002",
      worldId: "yamanose",
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "chat",
      message: { name: "Guest1002", text: "hi" },
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "system_message",
      text: "Nozomi set a new high score!",
      sentAt: 123,
    }),
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "arcade_high_score",
      machineId: "darts-1",
      score: 88.5,
      playerName: "Nozomi",
      achievedAt: 123,
    }),
  });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].forklifts[0].id, "forklift-1");
  assert.equal(snapshots[0].cargo[0].id, "cargo-job-1");
  assert.equal(snapshots[0].npcs[0].revision, 4);
  assert.equal(npcStates[0].revision, 5);
  assert.deepEqual(removedNpcs, ["old-npc"]);
  assert.equal(cargoEvents[0].ownerId, "one");
  assert.deepEqual(removedCargo, ["cargo-job-old"]);
  assert.equal(chats[0].text, "hi");
  assert.deepEqual(systemMessages, ["Nozomi set a new high score!"]);
  assert.deepEqual(arcadeHighScores, [{
    machineId: "darts-1",
    score: 88.5,
    playerName: "Nozomi",
    achievedAt: 123,
  }]);
  assert.deepEqual(clientCounts, [2]);
  assert.deepEqual(playerDirectories, [[
    { id: "one", name: "Guest1001", worldId: "dobuita" },
    { id: "two", name: "Guest1002", worldId: "yamanose" },
  ]]);
  assert.deepEqual(playerEntries, [{
    id: "two",
    name: "Guest1002",
    worldId: "yamanose",
  }]);
  assert.deepEqual(forkliftSounds, [{
    forkliftId: "forklift-2",
    cue: "flip_impact",
  }]);
  client.close();
});

test("saved-name validation completes before initial presence", async () => {
  FakeWebSocket.instances.length = 0;
  let finishWelcome;
  const welcomeReady = new Promise((resolve) => {
    finishWelcome = resolve;
  });
  const client = new MultiplayerClient({
    url: "ws://test/ws",
    WebSocketClass: FakeWebSocket,
    callbacks: {
      onWelcome: () => welcomeReady,
    },
  });
  client.setLocalPresence(localState());
  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "welcome",
      self: {
        id: "one",
        name: "Guest1001",
      },
      worldState: {},
      connectedClients: 1,
    }),
  });
  assert.equal(socket.sent.length, 0);
  finishWelcome();
  await welcomeReady;
  await Promise.resolve();
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, "presence");
  client.close();
});

test("a replaced session stops reconnecting and reports why it ended", () => {
  FakeWebSocket.instances.length = 0;
  const replacements = [];
  let resets = 0;
  const client = new MultiplayerClient({
    url: "ws://test/ws?characterId=7",
    WebSocketClass: FakeWebSocket,
    callbacks: {
      onSessionReplaced: (message) => replacements.push(message),
      onReset: () => {
        resets += 1;
      },
    },
  });
  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "session_replaced",
      message: "This character was opened elsewhere.",
    }),
  });
  assert.deepEqual(replacements, ["This character was opened elsewhere."]);
  assert.equal(resets, 1);
  assert.equal(socket.readyState, FakeWebSocket.CLOSED);
  assert.equal(client.intentionalClose, true);
  assert.equal(client.sessionReplaced, true);
  client.connect();
  assert.equal(FakeWebSocket.instances.length, 1);
});

test("a WebSocket construction failure leaves the game offline and retries", () => {
  const originalWindow = globalThis.window;
  let scheduled = null;
  globalThis.window = {
    setTimeout(callback, delay) {
      scheduled = { callback, delay };
      return 7;
    },
    clearTimeout() {
      scheduled = null;
    },
  };
  class ThrowingWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;

    constructor() {
      throw new Error("network unavailable");
    }
  }
  const statuses = [];
  try {
    const client = new MultiplayerClient({
      url: "ws://offline/ws",
      WebSocketClass: ThrowingWebSocket,
      callbacks: { onStatus: (status) => statuses.push(status) },
      random: () => 0.5,
    });
    client.connect();
    assert.deepEqual(statuses, ["connecting", "offline"]);
    assert.equal(scheduled.delay, 500);
    client.close();
    assert.equal(scheduled, null);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("players keep moving offline and reconnect with their latest presence", () => {
  const originalWindow = globalThis.window;
  const scheduled = [];
  globalThis.window = {
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeout() {},
  };
  FakeWebSocket.instances.length = 0;
  let resets = 0;
  try {
    const client = new MultiplayerClient({
      url: "ws://recovering/ws",
      WebSocketClass: FakeWebSocket,
      callbacks: {
        onReset() { resets += 1; },
      },
    });
    client.setLocalPresence(localState());
    client.connect();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    firstSocket.emit("message", {
      data: JSON.stringify({
        v: MULTIPLAYER_PROTOCOL_VERSION,
        type: "welcome",
        self: {
          id: "one",
          name: "Guest1001",
        },
        worldState: {},
      }),
    });

    firstSocket.close();
    assert.equal(resets, 1);
    assert.equal(scheduled.length, 1);
    assert.equal(client.setLocalPresence(localState({
      x: 9,
      z: 7,
      movement: "run",
    })), false);

    scheduled[0].callback();
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();
    secondSocket.emit("message", {
      data: JSON.stringify({
        v: MULTIPLAYER_PROTOCOL_VERSION,
        type: "welcome",
        self: {
          id: "two",
          name: "Guest1002",
        },
        worldState: {},
      }),
    });
    assert.equal(secondSocket.sent.length, 1);
    assert.equal(secondSocket.sent[0].type, "presence");
    assert.equal(secondSocket.sent[0].x, 9);
    assert.equal(secondSocket.sent[0].z, 7);
    assert.equal(secondSocket.sent[0].movement, "run");
    client.close();
  } finally {
    globalThis.window = originalWindow;
  }
});

test("vending purchases resolve only from the matching server result", async () => {
  FakeWebSocket.instances.length = 0;
  const results = [];
  const client = new MultiplayerClient({
    url: "ws://test/ws",
    WebSocketClass: FakeWebSocket,
    callbacks: {
      onVendingResult: (result) => results.push(result),
    },
  });
  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "welcome",
      self: {
        id: "one",
        name: "Ryo",
      },
      worldState: {},
      connectedClients: 1,
    }),
  });

  const purchase = client.purchaseVending(
    "dobuita-vm-0-0",
    "jet_cola",
    "purchase-0001",
  );
  assert.deepEqual(socket.sent.at(-1), {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    type: "vending_purchase",
    requestId: "purchase-0001",
    machineId: "dobuita-vm-0-0",
    drinkKey: "jet_cola",
  });
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "vending_result",
      requestId: "purchase-0001",
      machineId: "dobuita-vm-0-0",
      drinkKey: "jet_cola",
      winningCan: false,
      outcome: "purchased",
      yen: 400,
      inventory: [],
    }),
  });
  assert.equal((await purchase).yen, 400);
  assert.equal(results.length, 1);

  const rejected = client.purchaseVending(
    "dobuita-vm-0-0",
    "jet_cola",
    "purchase-0002",
  );
  socket.emit("message", {
    data: JSON.stringify({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "vending_result",
      requestId: "purchase-0002",
      outcome: "insufficient_funds",
      message: "You need ¥100.",
    }),
  });
  await assert.rejects(rejected, (error) => (
    error.outcome === "insufficient_funds"
    && error.message === "You need ¥100."
  ));
  client.close();
});

test("remote interpolation utilities smooth angles and snap teleports", () => {
  assert.ok(interpolationAlpha(0.1) > 0);
  assert.ok(interpolationAlpha(0.1) < 1);
  assert.ok(Math.abs(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
  assert.equal(
    shouldSnapPosition(
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ),
    true,
  );
  assert.equal(
    shouldSnapPosition(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ),
    false,
  );
});
