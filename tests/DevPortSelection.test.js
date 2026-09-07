import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

import {
  nextAvailablePort,
  portFromAddress,
  requestedPort,
} from "../scripts/dev-port-selection.mjs";

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("development port selection skips an occupied preferred port", async () => {
  const occupied = net.createServer();
  const occupiedPort = await listen(occupied);
  try {
    const selected = await nextAvailablePort(occupiedPort);
    assert.notEqual(selected, occupiedPort);
    assert.ok(selected > occupiedPort);
  } finally {
    await close(occupied);
  }
});

test("development port settings accept explicit ports and HTTP addresses", () => {
  assert.equal(requestedPort("5199", 5173), 5199);
  assert.equal(requestedPort("invalid", 5173), 5173);
  assert.equal(portFromAddress("127.0.0.1:8181", 8080), 8181);
  assert.equal(portFromAddress(":8282", 8080), 8282);
});
