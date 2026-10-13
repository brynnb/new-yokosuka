#!/usr/bin/env node
// Deterministic content translation, not a second quest engine: output ordinary
// official Yarn imports consumed by the authoritative server.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { nativeDialogueSpeakerLabel } from "../../play/dialogue/NativeDialogueSpeaker.js";

const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "story-investigation.json")));
if (spec.schema !== "new-yokosuka-authored-talk-routes-v1") throw new Error("Unsupported talk route schema");
const voices = new Set(), imports = [];
for (const route of spec.routes) {
  const participants = [route.actor, ...(route.participants || [])];
  const { NATIVE_DIALOGUE_MESSAGE_RESOURCE: source } = await import(pathToFileURL(path.join(root, "play/data/dialogue/messages", `${route.actor}.generated.js`)));
  const lines = route.voiceIds.map(id => {
    const matches = source.messages.filter(message => message.voiceId === id);
    const line = matches[0];
    if (!line?.displayText || !["AKIR", ...participants].includes(line.speakerId)
      || matches.some(other => other.displayText !== line.displayText || other.speakerId !== line.speakerId)) throw new Error(`Missing or ambiguous source line ${id}`);
    if (/[<>#\[\]{}]/.test(line.displayText)) throw new Error(`Needs reviewed Yarn escaping: ${id}`);
    voices.add(id);
    return `${nativeDialogueSpeakerLabel({ speakerId: line.speakerId })}: ${line.displayText.replaceAll("\n", "[br/]")} #voice:${id} #speaker:${line.speakerId}`;
  });
  const gates = ['play_mode() != "story"', '!opening_completed()', ...participants.map(actor => `!actor_present("${actor}")`), ...route.requiredFlags.map(flag => `!flag_set("${flag}")`), `flag_set("${route.completedFlag}")`];
  if (route.hours) gates.push(route.hours[0] < route.hours[1]
    ? `(game_hour() < ${route.hours[0]} || game_hour() >= ${route.hours[1]})`
    : `(game_hour() < ${route.hours[0]} && game_hour() >= ${route.hours[1]})`);
  const nativeEffects = (route.nativeEffects || []).map(effect => {
    if (!/^2:\d+$/.test(effect.address) || ![0, 1].includes(effect.value) || !route.nativeSources?.length) throw new Error(`Unreviewed native effect in ${route.id}`);
    return `<<set_native_value "${effect.address}" ${effect.value}>>`;
  });
  const sourceText = `title: Start\ntags: adaptation story disc1 ${route.area} ${route.actor}\n---\n<<if ${gates.join(" || ")}>>\n    <<pass_trigger>>\n<<endif>>\n${participants.map(actor => `<<look_at_actor "${actor}" "AKIR">>`).join("\n")}\n${lines.join("\n")}\n${participants.map(actor => `<<clear_actor_look "${actor}">>`).join("\n")}\n${nativeEffects.concat([route.completedFlag, ...route.effects].map(flag => `<<set_flag "${flag}">>`)).join("\n")}\n<<complete>>\n===\n`;
  imports.push({ Slug: `story-s1-${route.id}`, Title: route.title,
    Description: spec.provenance, Summary: "Personal investigation conversation; original voiced lines, authored sequence, existing NPC facing and gameplay camera. No item or currency reward.",
    NativeSources: [{ role: "dialogue", locator: `${source.generatedFrom.archive}#${route.actor}/${route.id}`, sha256: source.generatedFrom.sha256 }, ...(route.nativeSources || [])],
    SourceText: sourceText, Triggers: [{ nodeId: "Start", kind: "talk", area: route.area, actor: route.actor, priority: 200 }],
    TestFixtures: [{ Name: "Eligible personal investigation", StartNode: "Start", Fixture: {
      playMode: "story", openingCompleted: true, scene: route.area, gameHour: route.hours ? Math.max(10,route.hours[0]) : 10,
      flags: Object.fromEntries(route.requiredFlags.map(flag => [flag, true])),
      actorPresence: Object.fromEntries(participants.map(actor => [actor, true])),
    } }],
  });
}
fs.writeFileSync(path.join(server, "internal/officialscript/early_investigation.generated.json"), JSON.stringify(imports, null, 2) + "\n");
// Runtime authority boundary: translated Story talks cannot silently select a
// different native branch when their server gate passes or is unavailable.
fs.writeFileSync(path.join(root, "play/data/authored-story-talks.json"), JSON.stringify({
  schema: "new-yokosuka-authored-story-talks-v1",
  talks: spec.routes.map(({ area, actor }) => ({ area, actor })),
}, null, 2) + "\n");
if (process.argv.includes("--voices")) {
  if (!process.env.VGMSTREAM_CLI) throw new Error("VGMSTREAM_CLI is required for --voices");
  const temporary = fs.mkdtempSync("/var/tmp/ny-investigation-voices-");
  try {
    const manifest = path.join(temporary, "manifest.json");
    execFileSync("python3", ["-m", "tools.scripting.build_dialogue_voice_pack", ...[...voices].flatMap(id => ["--voice-id", id]),
      "--output-dir", "public/audio/dialogue", "--manifest-output", manifest, "--base-url", "/audio/dialogue",
      "--vgmstream-cli", process.env.VGMSTREAM_CLI, "--jobs", process.env.STORY_VOICE_JOBS || "4"],
      { cwd: root, env: { ...process.env, TMPDIR: temporary }, stdio: "inherit" });
    const filename = path.join(root, "public/audio/dialogue/manifest.json");
    const existing = JSON.parse(fs.readFileSync(filename));
    const additions = JSON.parse(fs.readFileSync(manifest));
    existing.updatedBy = [...new Set([...(existing.updatedBy || []), "tools/scripting/build_story_investigation.mjs"])];
    const map = new Map(existing.lines.map(line => [line.voiceId, line]));
    for (const line of additions.lines) map.set(line.voiceId, line);
    existing.lines = [...map.values()].sort((a,b) => a.voiceId.localeCompare(b.voiceId));
    fs.writeFileSync(filename, JSON.stringify(existing, null, 2) + "\n");
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
console.log(`Generated ${imports.length} official conversations (${voices.size} original voice lines).`);
