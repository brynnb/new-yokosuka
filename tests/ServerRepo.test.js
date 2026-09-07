import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveServerRepo } from "../scripts/server-repo.mjs";

function fixture(moduleName = "github.com/brynnb/new-yokosuka-server") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-server-"));
  const serverRoot = path.join(root, "backend");
  fs.mkdirSync(serverRoot);
  fs.writeFileSync(path.join(serverRoot, "go.mod"), `module ${moduleName}\n`);
  return { root, serverRoot };
}

test("the standalone server path can be configured explicitly", (context) => {
  const { root, serverRoot } = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveServerRepo({
    environment: { NEW_YOKOSUKA_SERVER_DIR: serverRoot },
    projectRoot: root,
  }), serverRoot);
});

test("the standalone server defaults to a sibling checkout", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-client-"));
  const projectRoot = path.join(root, "new-yokosuka");
  const serverRoot = path.join(root, "new-yokosuka-server");
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(serverRoot);
  fs.writeFileSync(
    path.join(serverRoot, "go.mod"),
    "module github.com/brynnb/new-yokosuka-server\n",
  );
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveServerRepo({ environment: {}, projectRoot }), serverRoot);
});

test("an unrelated Go checkout is rejected", (context) => {
  const { root, serverRoot } = fixture("example.com/not-the-server");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => resolveServerRepo({
    environment: { NEW_YOKOSUKA_SERVER_DIR: serverRoot },
    projectRoot: root,
  }), /not the New Yokosuka Server repository/);
});
