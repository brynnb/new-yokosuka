#!/usr/bin/env node
// Inventory, not a visual pass: keep unbound native calls visible for follow-up.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const json = file => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  if (!["--browser-reports", "--output"].includes(name) || !value || value.startsWith("--") || options.has(name)) {
    throw new Error("Usage: audit_cutscene_hands.mjs [--browser-reports directory] [--output file]");
  }
  options.set(name, value);
}
const browserReports = new Map();
if (options.has("--browser-reports")) {
  const directory = path.resolve(root, options.get("--browser-reports"));
  for (const entry of readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const file = path.join(directory, entry.name, "browser-inventory.json");
    if (!existsSync(file)) continue; // An in-progress scene has no terminal report yet.
    const report = JSON.parse(readFileSync(file, "utf8"));
    if (browserReports.has(report.cutsceneId)) throw new Error(`Duplicate browser report for ${report.cutsceneId}`);
    browserReports.set(report.cutsceneId, { file: path.relative(root, file), report });
  }
}
const routes = json("tools/data/native-activity-preview-routes.json").routes;
const previews = json("play/data/events/nativeActivityPreviewPrograms.generated.json").programs;
const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [{ CUTSCENES }, { NATIVE_CUTSCENE_PACKAGES }] = await Promise.all([
    vite.ssrLoadModule("/play/config/cutscenes.js"),
    vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js"),
  ]);
  const emitted = new Set();
  const scenes = CUTSCENES.map(scene => {
    const route = routes.find(route => route.cutsceneId === scene.id);
    const pkg = NATIVE_CUTSCENE_PACKAGES.find(pkg => pkg.id === scene.packageId);
    const manifest = pkg.playback.manifest;
    const preview = previews.find(program => program.selector.cutsceneId === scene.id)?.preview;
    if (!preview) throw new Error(`${scene.id}: missing compiled preview`);
    // Compiled order includes native-owner ordering and repeated occurrences;
    // manifest storage order and a route without explicit slots do not.
    const requested = preview.activities || [preview.activity];
    const activities = requested.map(selection => {
      const matches = manifest.activities.filter(activity => activity.activityId === selection.activityId);
      if (matches.length !== 1) throw new Error(`${scene.id}: ambiguous hand-audit activity`);
      return matches[0];
    });
    const findings = [];
    const cues = activities.flatMap(activity => activity.nativeHandPoseCues || []);
    const bodyCues = activities.flatMap(activity => activity.nativeBodyHandPoseCues || []);
    for (const [actor, definition] of Object.entries(pkg.presentation?.handAssets || {})) {
      if (definition.mode === "body-only") continue;
      for (const record of [definition.left?.model, definition.right?.model, definition.rig]) {
        if (!record?.path || !pkg.assets?.[record.path]) findings.push(`hand-asset-not-bundled:${actor}:${record?.path}`);
      }
    }
    for (const cue of cues) {
      emitted.add(`${route.area}:${cue.callFileOffset}`);
      const definition = pkg.presentation?.handAssets?.[cue.actorTag];
      if (!definition || definition.mode === "body-only") findings.push(`missing-hand-assets:${cue.actorTag}`);
      if (manifest.nativeHandPoseTables?.[cue.poseTableOffset]?.vectors?.length !== 19) {
        findings.push(`missing-pose-table:${cue.poseTableOffset}`);
      }
    }
    for (const cue of bodyCues) {
      if (!pkg.presentation?.handAssets?.[cue.actorTag]) findings.push(`missing-body-hand-binding:${cue.actorTag}`);
    }
    for (const cue of activities.flatMap(activity => activity.nativeDetailedHandDefaults || [])) {
      if (cue.poseTableOffset) findings.push(`dropped-default-pose:${cue.callFileOffset}`);
    }
    let browserVerification;
    if (options.has("--browser-reports")) {
      const saved = browserReports.get(scene.id);
      if (!saved) browserVerification = { status: "not-yet-reported" };
      else {
        // Compare only fields the browser actually records. Exact pose words
        // and MHND target rows remain the focused hand suite's responsibility.
        // Do not sort the observations: dropped or reordered cues must fail.
        const expected = activities.flatMap(activity => [
          ...(activity.nativeHandPoseCues || []), ...(activity.nativeBodyHandPoseCues || []),
        ].sort((a, b) => a.frame - b.frame || a.sourceOrder - b.sourceOrder))
          .map(cue => [cue.poseTableOffset ? "hand-pose" : "body-hand-pose",
            cue.actorTag, cue.side ?? null, cue.poseTableOffset ?? null]);
        const commands = saved.report.probe?.handCommands;
        const observed = commands?.map(command => [command.name,
          command.actorTag, command.side ?? null, command.poseTableOffset ?? null]);
        const complete = saved.report.verification?.fullBrowserPlayback === true;
        const matched = JSON.stringify(observed) === JSON.stringify(expected);
        const accepted = Array.isArray(commands) && commands.every(command => command.accepted === true);
        browserVerification = {
          status: complete && matched && accepted ? "matched" : "failed",
          report: saved.file, fullBrowserPlayback: complete,
          expectedCommandCount: expected.length, observedCommandCount: commands?.length ?? null,
          commandOrderMatched: matched, allCommandsAccepted: accepted,
          ...(!matched ? { expected, observed: observed ?? null } : {}),
        };
      }
    }
    return {
      cutsceneId: scene.id, label: scene.label, area: route.area,
      activities: activities.map(activity => activity.activityId),
      detailedHandActors: Object.entries(pkg.presentation?.handAssets || {})
        .filter(([, definition]) => definition.mode !== "body-only").map(([actor]) => actor),
      bodyOnlyHandActors: Object.entries(pkg.presentation?.handAssets || {})
        .filter(([, definition]) => definition.mode === "body-only").map(([actor]) => actor),
      poseCommandCount: cues.length, bodyHandCommandCount: bodyCues.length,
      posedActors: [...new Set(cues.map(cue => cue.actorTag))],
      findings: [...new Set(findings)],
      sourceCompleteness: "requires-owner-and-callback-comparison",
      visuallyReviewed: false,
      ...(browserVerification ? { browserVerification } : {}),
    };
  });
  const sources = json("play/data/events/nativeEventPrograms.generated.json").programs
    .filter(program => program.entryFunction !== "$activity-preview" && program.entryFunction !== "$activity-sequence")
    .map(program => ({ area: program.area, functions: program.functions,
      path: "play/data/events/nativeEventPrograms.generated.json" }));
  for (const name of readdirSync(path.join(root, "tools/evidence")).filter(name => name.endsWith("callback-ir.json"))) {
    const file = `tools/evidence/${name}`;
    const evidence = json(file);
    if (evidence.source?.area) sources.push({ area: evidence.source.area, path: file,
      functions: [evidence.function, ...(evidence.functions || []), ...(evidence.supportingFunctions || [])].filter(Boolean) });
  }
  const unmapped = new Map();
  for (const source of sources) {
    if (!routes.some(route => route.area === source.area)) continue;
    for (const fn of source.functions) for (const block of fn.blocks) for (const action of block.actions || []) {
      if (action.semanticId !== "resolved-object-hndl-hndr-vector-install") continue;
      const key = `${source.area}:${action.callFileOffset}`;
      if (emitted.has(key)) continue;
      unmapped.set(key, { area: source.area, function: fn.id, callFileOffset: action.callFileOffset,
        arguments: action.arguments, evidence: source.path,
        classification: "unmapped-source-call-not-yet-attributed-to-a-selected-activity" });
    }
  }
  const report = {
    generatedBy: "tools/cutscenes/audit_cutscene_hands.mjs",
    boundary: "Checks every menu selection's emitted hand data and asset bindings. Unmapped native calls can belong to setup, unused branches, or other events: they are review candidates, not proof every scene in that area is broken. No emitted cue is not proof of no authored hand animation. This report is not rendered verification.",
    summary: { selections: scenes.length, withPoseCommands: scenes.filter(scene => scene.poseCommandCount).length,
      bindingFailures: scenes.filter(scene => scene.findings.length).length, unmappedSourceCalls: unmapped.size },
    scenes, unmappedSourceCalls: [...unmapped.values()],
  };
  if (options.has("--browser-reports")) {
    const unknown = [...browserReports.keys()].filter(id => !scenes.some(scene => scene.cutsceneId === id));
    if (unknown.length) throw new Error(`Unknown browser cutscene IDs: ${unknown.join(", ")}`);
    report.browserVerification = {
      boundary: "Compares complete-playback browser command delivery with the current packaged cue order. Does not establish source completeness, exact frame/pose values, or visible correctness. Use one serial sweep directory without replay commands; missing terminal reports remain pending.",
      matched: scenes.filter(scene => scene.browserVerification.status === "matched").length,
      failed: scenes.filter(scene => scene.browserVerification.status === "failed").map(scene => scene.cutsceneId),
      pending: scenes.filter(scene => scene.browserVerification.status === "not-yet-reported").map(scene => scene.cutsceneId),
    };
    if (report.browserVerification.failed.length) process.exitCode = 1;
  }
  writeFileSync(path.resolve(root, options.get("--output") || "tools/evidence/cutscene-hand-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary));
  if (report.browserVerification) {
    const { matched, failed, pending } = report.browserVerification;
    console.log(JSON.stringify({ browserCommandMatches: matched, failed, pending: pending.length }));
  }
} finally {
  await vite.close();
}
