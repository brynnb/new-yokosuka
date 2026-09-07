import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("recovers Hato's native child-coroutine launch path", () => {
  const mapinfo = (
    ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
  );
  if (!fs.existsSync(mapinfo)) return;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogue-graph-"));
  const regionsPath = path.join(temporary, "regions.json");
  const outputPath = path.join(temporary, "graph.json");
  fs.writeFileSync(regionsPath, JSON.stringify({
    regions: [{
      disc: 1,
      area: "D000",
      mapinfo,
      executableTargetIndex: 629,
      regionStartFileOffset: "0x7fa98",
      voiceIds: ["F1030B001"],
      actorTags: ["HATO"],
    }],
  }));
  execFileSync("python3", [
    "-m", "tools.scripting.extract_dialogue_call_graph",
    "--regions", regionsPath,
    "--output", outputPath,
  ]);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(report.schema, "new-yokosuka-dialogue-call-graph-v2");
  const hato = report.maps[0].dialogue[0];
  const pathFromLaunch = hato.launchPaths.find(
    (item) => item.launchCallFileOffset === "0x76906",
  );
  assert.ok(pathFromLaunch);
  assert.equal(
    pathFromLaunch.rootKind,
    "operation-0x0002-child-coroutine",
  );
  assert.equal(pathFromLaunch.launchedFunctionFileOffset, "0x7a17c");
  assert.deepEqual(
    pathFromLaunch.directCalls.map((item) => item.callFileOffset),
    ["0x7a696", "0x7ac72", "0x800d0"],
  );
  assert.deepEqual(hato.unresolvedDynamicRoots, []);
});
