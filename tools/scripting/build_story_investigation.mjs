#!/usr/bin/env node
// Deterministic content translation, not a second quest engine: output ordinary
// official Yarn imports consumed by the authoritative server.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afsMembers } from "../lib/NativeAseqAudioPack.mjs";
import { parseNativeSrfRecords } from "../../src/NativeLipSync.js";
import { nativeDialogueSpeakerLabel } from "../../play/dialogue/NativeDialogueSpeaker.js";

const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "story-investigation.json")));
if (spec.schema !== "new-yokosuka-authored-talk-routes-v1") throw new Error("Unsupported talk route schema");
const voices = new Set(), streamVoices = new Map(), imports = [];
for (const route of spec.routes) {
  const participants = [route.actor, ...(route.participants || [])];
  let source;
  if (route.dialogueArchive) {
    const filename = path.join(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files"), route.dialogueArchive.path);
    const bytes = fs.readFileSync(filename);
    if (createHash("sha256").update(bytes).digest("hex") !== route.dialogueArchive.sha256) throw new Error(`Changed archive for ${route.id}`);
    const members = afsMembers(bytes, route.id);
    const speech = members.filter(member => /\.str$/i.test(member.name));
    const records = parseNativeSrfRecords(members.find(member => /\.srf$/i.test(member.name)).bytes);
    if (speech.length !== records.length) throw new Error(`Unmatched voice/subtitle records for ${route.id}`);
    source = { generatedFrom: { archive: `disc1/${route.dialogueArchive.path}`, sha256: route.dialogueArchive.sha256 },
      messages: records.map((record, index) => {
        const member = speech[index], voiceId = member.name.replace(/\.str$/i, "");
        streamVoices.set(voiceId, { voiceId, actorCodes: [record.speakerId], variants: [{
          sha256: createHash("sha256").update(member.bytes).digest("hex"), nativeByteLength: member.bytes.length,
          sources: [{ archivePath: filename, member: member.name }],
        }] });
        return { ...record, voiceId };
      }) };
  } else {
    ({ NATIVE_DIALOGUE_MESSAGE_RESOURCE: source } = await import(pathToFileURL(path.join(root, "play/data/dialogue/messages", `${route.actor}.generated.js`))));
  }
  const dialogueLines = ids => ids.map(id => {
    const matches = source.messages.filter(message => message.voiceId === id);
    const line = matches[0];
    if (!line?.displayText || !["AKIR", ...participants].includes(line.speakerId)
      || matches.some(other => other.displayText !== line.displayText || other.speakerId !== line.speakerId)) throw new Error(`Missing or ambiguous source line ${id}`);
    if (/[<>#\[\]{}]/.test(line.displayText)) throw new Error(`Needs reviewed Yarn escaping: ${id}`);
    voices.add(id);
    return `${nativeDialogueSpeakerLabel({ speakerId: line.speakerId })}: ${line.displayText.replaceAll("\n", "[br/]")} #voice:${id} #speaker:${line.speakerId}`;
  });
  const lines = dialogueLines(route.voiceIds);
  const leadIn = dialogueLines(route.leadInVoiceIds || []);
  const gates = ['play_mode() != "story"', '!opening_completed()', ...(route.presentActors || participants).map(actor => `!actor_present("${actor}")`), ...route.requiredFlags.map(flag => `!flag_set("${flag}")`), `flag_set("${route.completedFlag}")`];
  if (route.hours) gates.push(route.hours[0] < route.hours[1]
    ? `(game_hour() < ${route.hours[0]} || game_hour() >= ${route.hours[1]})`
    : `(game_hour() < ${route.hours[0]} && game_hour() >= ${route.hours[1]})`);
  const nativeEffects = (route.nativeEffects || []).map(effect => {
    if (!/^2:\d+$/.test(effect.address) || ![0, 1].includes(effect.value) || !route.nativeSources?.length) throw new Error(`Unreviewed native effect in ${route.id}`);
    return `<<set_native_value "${effect.address}" ${effect.value}>>`;
  });
  let body;
  if (route.challenge) {
    if (!route.staging || !leadIn.length) throw new Error(`Challenge ${route.id} needs reviewed staging and lead-in`);
    body = `<<jump Attempt>>\n===\ntitle: Attempt\n---\n<<play_sequence "${route.staging}.start">>\n${leadIn.join("\n")}\n<<start_challenge "${route.challenge}">>\n<<if challenge_result("${route.challenge}") != "success">>\n<<play_sequence "${route.staging}.finish">>\n-> Try again\n    <<jump Attempt>>\n-> Leave it for now\n    <<complete>>\n<<else>>\n${lines.join("\n")}\n<<play_sequence "${route.staging}.finish">>\n${nativeEffects.concat([route.completedFlag, ...route.effects].map(flag => `<<set_flag "${flag}">>`)).join("\n")}\n<<complete>>\n<<endif>>`;
  } else {
    body = `${participants.map(actor => `<<look_at_actor "${actor}" "AKIR">>`).join("\n")}\n${lines.join("\n")}\n${participants.map(actor => `<<clear_actor_look "${actor}">>`).join("\n")}\n${nativeEffects.concat([route.completedFlag, ...route.effects].map(flag => `<<set_flag "${flag}">>`)).join("\n")}\n<<complete>>`;
  }
  const sourceText = `title: Start\ntags: adaptation story disc1 ${route.area} ${route.actor}\n---\n<<if ${gates.join(" || ")}>>\n    <<pass_trigger>>\n<<endif>>\n${body}\n===\n`;
  imports.push({ Slug: `story-s1-${route.id}`, Title: route.title,
    Description: route.provenance || spec.provenance, Summary: route.challenge ? "Personal voiced encounter; explicit server-validated QTE before clue settlement. Authored staging; no item or currency reward." : "Personal investigation conversation; original voiced lines, authored sequence, existing NPC facing and gameplay camera. No item or currency reward.",
    NativeSources: [{ role: "dialogue", locator: `${source.generatedFrom.archive}#${route.actor}/${route.id}`, sha256: source.generatedFrom.sha256 }, ...(route.nativeSources || [])],
    SourceText: sourceText, Triggers: [{ nodeId: "Start", kind: route.trigger || "talk", area: route.area, ...(route.trigger ? {} : { actor: route.actor }), priority: 200 }],
    TestFixtures: [{ Name: "Eligible personal investigation", StartNode: "Start", Fixture: {
      playMode: "story", openingCompleted: true, scene: route.area, gameHour: route.hours ? Math.max(10,route.hours[0]) : 10,
      flags: Object.fromEntries(route.requiredFlags.map(flag => [flag, true])),
      actorPresence: Object.fromEntries((route.presentActors || participants).map(actor => [actor, true])),
    } }],
  });
}
fs.writeFileSync(path.join(server, "internal/officialscript/early_investigation.generated.json"), JSON.stringify(imports, null, 2) + "\n");
// Runtime authority boundary: translated Story talks cannot silently select a
// different native branch when their server gate passes or is unavailable.
fs.writeFileSync(path.join(root, "play/data/authored-story-talks.json"), JSON.stringify({
  schema: "new-yokosuka-authored-story-talks-v1",
  talks: spec.routes.filter(route => !route.trigger).map(({ area, actor }) => ({ area, actor })),
}, null, 2) + "\n");
if (process.argv.includes("--voices")) {
  if (!process.env.VGMSTREAM_CLI) throw new Error("VGMSTREAM_CLI is required for --voices");
  const temporary = fs.mkdtempSync("/var/tmp/ny-investigation-voices-");
  try {
    const manifest = path.join(temporary, "manifest.json");
    const sourceFile = path.join(temporary, "sources.json");
    const sources = JSON.parse(fs.readFileSync(path.join(root, ".disc-work/dialogue/actor-dialogue-voice-sources.json")));
    sources.voices.push(...streamVoices.values());
    fs.writeFileSync(sourceFile, JSON.stringify(sources));
    execFileSync("python3", ["-m", "tools.scripting.build_dialogue_voice_pack", "--sources", sourceFile, ...[...voices].flatMap(id => ["--voice-id", id]),
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
