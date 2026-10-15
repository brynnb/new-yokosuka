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
import { nativeDialogueSpeakerLabel, NATIVE_DIALOGUE_SPEAKER_LABELS } from "../../play/dialogue/NativeDialogueSpeaker.js";

const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "story-investigation.json")));
if (spec.schema !== "new-yokosuka-authored-talk-routes-v1") throw new Error("Unsupported talk route schema");
const voices = new Set(), streamVoices = new Map(), imports = [];
const voiceRouteIds = process.argv.flatMap((value,index)=>value === "--voice-route" ? [process.argv[index+1]] : []);
if (voiceRouteIds.some(id=>!spec.routes.some(route=>route.id===id))) throw new Error("Unknown --voice-route");
const exportedVoices = new Set();
const triggerPriorities = new Map();
const storyRegions=JSON.parse(fs.readFileSync(path.join(server,"internal/scriptevent/story_regions.json"))).regions;
for (const route of spec.routes) {
  const disc=route.disc ?? 1;
  if(![1,2,3].includes(disc))throw Error(`Invalid Shenmue I source disc in ${route.id}`);
  const region=storyRegions.find(r=>r.id===route.bounds);
  if(region?.hours&&JSON.stringify(region.hours)!==JSON.stringify(route.hours))throw Error(`Client dispatch and authoritative Yarn hours disagree in ${route.id}`);
  // The server rejects equal-priority candidates before running their gates.
  // Distinct bounds/flags do not disambiguate an otherwise identical selector.
  const key = [route.trigger || "talk", route.area, route.object || (route.trigger ? "" : route.actor), route.priority ?? 200].join(":");
  if (triggerPriorities.has(key)) throw new Error(`Ambiguous trigger priority: ${triggerPriorities.get(key)} and ${route.id} (${key})`);
  triggerPriorities.set(key, route.id);
}
for (const route of spec.routes) {
  const participants = [route.actor, ...(route.participants || [])];
  const disc=route.disc ?? 1;
  if (route.unidentifiedVoiceSpeaker && !NATIVE_DIALOGUE_SPEAKER_LABELS[route.unidentifiedVoiceSpeaker]) throw new Error(`Unknown neutral voice role in ${route.id}`);
  if(route.yarnTemplate&&!/^story-[a-z0-9-]+\.yarn$/.test(route.yarnTemplate))throw Error(`Invalid authored Yarn template ${route.id}`);
  const template=route.yarnTemplate?fs.readFileSync(path.join(import.meta.dirname,route.yarnTemplate),"utf8"):null;
  // Templates carry their own voice references. A route with no separate line
  // list is not necessarily silent; do not discard its real dialogue source.
  const templateHasVoice=template&&/\{\{voice:[A-Z0-9]+\}\}/.test(template);
  let source;
  if (route.dialogueArchive || route.dialogueArchives) {
    const archiveSources=[];
    const messages=[];
    for(const archive of route.dialogueArchives || [route.dialogueArchive]) {
    const filename = path.join(process.env[`SHENMUE_DISC${disc}_EXTRACTED_ROOT`] || path.join(root, disc===1?"extracted_files":`extracted_disc${disc}_v2`), archive.path);
    const bytes = fs.readFileSync(filename);
    if (createHash("sha256").update(bytes).digest("hex") !== archive.sha256) throw new Error(`Changed archive for ${route.id}`);
    const members = afsMembers(bytes, route.id);
    const speech = members.filter(member => /\.str$/i.test(member.name));
    const records = parseNativeSrfRecords(members.find(member => /\.srf$/i.test(member.name)).bytes);
    if (speech.length !== records.length) throw new Error(`Unmatched voice/subtitle records for ${route.id}`);
    archiveSources.push({archive:`disc${disc}/${archive.path}`,sha256:archive.sha256});
    messages.push(...records.map((record, index) => {
        const member = speech[index], voiceId = member.name.replace(/\.str$/i, "");
        streamVoices.set(voiceId, { voiceId, actorCodes: [record.speakerId], variants: [{
          sha256: createHash("sha256").update(member.bytes).digest("hex"), nativeByteLength: member.bytes.length,
          sources: [{ archivePath: filename, member: member.name }],
        }] });
        return { ...record, voiceId };
      }));
    }
    source={generatedFrom:archiveSources[0],archiveSources,messages};
  } else if ((route.activities || route.yarnTemplate) && !route.voiceIds.length && !route.leadInVoiceIds?.length && !templateHasVoice && route.nativeSources?.length) {
    // Silent presentation and explicitly authored text carry their reviewed
    // source provenance directly. Do not invent an AKIR voice resource.
    source = {archiveSources:[],messages:[]};
  } else {
    ({ NATIVE_DIALOGUE_MESSAGE_RESOURCE: source } = await import(pathToFileURL(path.join(root, "play/data/dialogue/messages", `${route.actor}.generated.js`))));
  }
  const dialogueLines = ids => ids.map(id => {
    const matches = source.messages.filter(message => message.voiceId === id);
    const line = matches[0];
    // Telephone SRF records omit the remote participant. A reviewed neutral
    // presentation role may label those voices, never replace a known actor.
    const speakerId = line?.speakerId || route.unidentifiedVoiceSpeaker;
    if (!line?.displayText || !["AKIR", ...participants, ...(route.unidentifiedVoiceSpeaker ? [route.unidentifiedVoiceSpeaker] : [])].includes(speakerId)
      || matches.some(other => other.displayText !== line.displayText || other.speakerId !== line.speakerId)) throw new Error(`Missing or ambiguous source line ${id}`);
    if (/[<>#\[\]{}]/.test(line.displayText)) throw new Error(`Needs reviewed Yarn escaping: ${id}`);
    voices.add(id);
    if (!voiceRouteIds.length || voiceRouteIds.includes(route.id)) exportedVoices.add(id);
    return `${nativeDialogueSpeakerLabel({ speakerId })}: ${line.displayText.replaceAll("\n", "[br/]")} #voice:${id} #speaker:${speakerId}`;
  });
  const lines = dialogueLines(route.voiceIds);
  const leadIn = dialogueLines(route.leadInVoiceIds || []);
  const questions=(route.victoryChoices || []).map(choice=>({label:choice.label,lines:dialogueLines(choice.voiceIds)}));
  const requiredItems = (route.requiredItems || []).map(({key,quantity}) => {
    if(!/^[a-z][a-z0-9_]*$/.test(key)||!Number.isSafeInteger(quantity)||quantity<1)throw new Error(`Invalid inventory prerequisite in ${route.id}`);
    return {key,quantity};
  });
  // Repeatability is for reviewed, reward-free room travel, not repeated quest
  // payouts. One-way milestone gates would strand a player after returning.
  if (route.repeatable && (!route.destination || route.items?.length || route.grantYen || route.recordDays?.length || route.timeTransition || route.nativeEffects?.length)) throw Error(`Unsafe repeatable route ${route.id}`);
  if (route.destination && !/^s1\.[a-z0-9.-]+$/.test(route.destination)) throw Error(`Invalid Story destination ${route.id}`);
  const gates = ['play_mode() != "story"', '!opening_completed()', ...(route.presentActors || participants).map(actor => `!actor_present("${actor}")`), ...route.requiredFlags.map(flag => `!flag_set("${flag}")`), ...(route.excludedFlags||[]).map(flag=>`flag_set("${flag}")`), ...requiredItems.map(({key,quantity})=>`!has_item("${key}", ${quantity})`), ...(route.repeatable ? [] : [`flag_set("${route.completedFlag}")`])];
  if (route.hours) gates.push(route.hours[0] < route.hours[1]
    ? `(game_hour() < ${route.hours[0]} || game_hour() >= ${route.hours[1]})`
    : `(game_hour() < ${route.hours[0]} && game_hour() >= ${route.hours[1]})`);
  if(route.bounds)gates.push(`!actor_in_bounds("AKIR", "${route.bounds}")`);
  if(route.sameDayAs)gates.push(`game_day() != progress_value("${route.sameDayAs}")`);
  if(route.dayAfter && !route.legacyDateNotice)gates.push(`progress_value("${route.dayAfter}") == 0 || game_day() <= progress_value("${route.dayAfter}")`);
  const nativeEffects = (route.nativeEffects || []).map(effect => {
    if (!/^2:\d+$/.test(effect.address) || ![0, 1].includes(effect.value) || !route.nativeSources?.length) throw new Error(`Unreviewed native effect in ${route.id}`);
    return `<<set_native_value "${effect.address}" ${effect.value}>>`;
  });
  const yenEffects=[];
  if(route.grantYen){
    const {amount,reason}=route.grantYen;
    if(!Number.isSafeInteger(amount)||amount<1||amount>1_000_000||!/^story\.s1\.[a-z0-9.-]+$/.test(reason)||!route.nativeSources?.length)throw Error(`Invalid reviewed yen grant in ${route.id}`);
    yenEffects.push(`<<grant_yen ${amount} "${reason}">>`);
  }
  const effects=[...nativeEffects,...yenEffects,...(route.recordDays||[]).map(key=>`<<record_game_day "${key}">>`),
    ...(route.items||[]).map(({key,quantity})=>{
      if(!/^[a-z][a-z0-9_]*$/.test(key)||!Number.isSafeInteger(quantity)||quantity<1)throw new Error(`Invalid inventory effect in ${route.id}`);
      return `<<give_item "${key}" ${quantity}>>`;
    }),
    ...[route.completedFlag,...route.effects].map(flag=>`<<set_flag "${flag}">>`)];
  let body;
  if (route.yarnTemplate) {
    // Yarn already owns branching/choices. Translate reviewed original voice
    // references inside its source instead of inventing a second node engine.
    if (!/^story-[a-z0-9-]+\.yarn$/.test(route.yarnTemplate) || lines.length || !route.staging) throw new Error(`Invalid authored Yarn template ${route.id}`);
    body = template
      .replace(/\{\{voice:([A-Z0-9]+)\}\}/g, (_, id) => dialogueLines([id])[0])
      .replace(/\{\{text:([a-z]+)\}\}/g, (_, key) => {
        const text=route.authoredText?.[key];
        if(typeof text!=="string"||!text.trim()||/[\n\r<>#\[\]{}]/.test(text))throw Error(`Missing or unsafe authored text ${route.id}/${key}`);
        return text;
      })
      .replaceAll("{{staging}}", route.staging)
      .replaceAll("{{destination}}", route.destination || "{{destination}}")
      .replaceAll("{{effects}}", effects.join("\n"));
    if (body.includes("{{")) throw new Error(`Unresolved Yarn template reference ${route.id}`);
  } else if(route.combat) {
    const dating=route.dayAfter ? `<<if progress_value("${route.dayAfter}") == 0>>\n${route.legacyDateNotice?`Ryo Hazuki: ${route.legacyDateNotice} #speaker:AKIR\n<<record_game_day "${route.dayAfter}">>\n<<jump Done>>`:'<<pass_trigger>>'}\n<<endif>>\n<<if game_day() <= progress_value("${route.dayAfter}")>>\n<<pass_trigger>>\n<<endif>>\n` : "";
    const choices=questions.length?questions.map(choice=>`-> ${choice.label}\n${choice.lines.map(line=>`    ${line}`).join("\n")}\n    <<jump Clue>>`).join("\n")+"\n===\ntitle: Clue\n---\n":"";
    const outcome=route.combatCompletion||"success";
    if(!["success","practiced"].includes(outcome))throw new Error(`Invalid combat outcome ${route.id}`);
    let ending;
    if(route.completionActivities) {
      if(route.staging || lines.length || questions.length || !route.completionActivities.length)throw new Error(`Invalid combat ending ${route.id}`);
      ending=route.completionActivities.map(id=>`<<start_activity "${id}">>`).join("\n");
    } else {
      if(!route.staging)throw new Error(`Missing combat ending ${route.id}`);
      ending=`<<play_sequence "${route.staging}.start">>\n${choices}${lines.join("\n")}\n<<play_sequence "${route.staging}.finish">>`;
    }
    const intro=route.introductionStaging?`<<play_sequence "${route.introductionStaging}.start">>\n${leadIn.join("\n")}\n<<play_sequence "${route.introductionStaging}.finish">>`:"";
    if(route.postCombatChallenge){
      if(questions.length||route.completionActivities)throw new Error(`Ambiguous combat/challenge ending ${route.id}`);
      const challenge=route.postCombatChallenge;
      ending=`<<jump Rescue>>\n<<endif>>\n===\ntitle: Rescue\n---\n<<play_sequence "${challenge.staging}.start">>\n${dialogueLines(challenge.voiceIds).join("\n")}\n<<start_challenge "${challenge.id}">>\n<<if challenge_result("${challenge.id}") != "success">>\n<<play_sequence "${challenge.staging}.finish">>\n-> Try again\n    <<jump Rescue>>\n-> Leave it for now\n    <<complete>>\n<<else>>\n<<play_sequence "${challenge.staging}.finish">>\n<<play_sequence "${challenge.successStaging}.start">>\n<<play_sequence "${challenge.successStaging}.finish">>\n${ending}`;
    }
    body=`${dating}${(route.introductionActivities||[]).map(id=>`<<start_activity "${id}">>`).join("\n")}\n${intro}\n<<jump Fight>>\n===\ntitle: Fight\n---\n<<start_combat "${route.combat}">>\n<<if combat_result("${route.combat}") != "${outcome}">>\n-> Try again\n    <<jump Fight>>\n-> Leave it for now\n    <<complete>>\n<<else>>\n${ending}\n${effects.join("\n")}\n<<complete>>\n${questions.length?"":"<<endif>>"}`;
    // The victory choice node ends the conditional before jumping to Clue.
    if(questions.length)body=body.replace("\n===\ntitle: Clue", "\n<<endif>>\n===\ntitle: Clue");
  } else if (route.challenge) {
    if (!route.staging || !leadIn.length) throw new Error(`Challenge ${route.id} needs reviewed staging and lead-in`);
    const challengeStage=route.challengeStaging||route.staging;
    const leadInBody=`<<play_sequence "${route.staging}.start">>\n${leadIn.join("\n")}${route.challengeStaging?`\n<<play_sequence "${route.staging}.finish">>\n<<play_sequence "${challengeStage}.start">>`:""}`;
    const success=route.successStaging
      ? `<<play_sequence "${challengeStage}.finish">>\n<<play_sequence "${route.successStaging}.start">>\n<<play_sequence "${route.successStaging}.finish">>\n<<play_sequence "${route.aftermathStaging}.start">>\n${lines.join("\n")}\n<<play_sequence "${route.aftermathStaging}.finish">>`
      : `${lines.join("\n")}\n<<play_sequence "${challengeStage}.finish">>`;
    if(route.successStaging && !route.aftermathStaging)throw Error(`Missing challenge aftermath ${route.id}`);
    body = `<<jump Attempt>>\n===\ntitle: Attempt\n---\n${leadInBody}\n<<start_challenge "${route.challenge}">>\n<<if challenge_result("${route.challenge}") != "success">>\n<<play_sequence "${challengeStage}.finish">>\n-> Try again\n    <<jump Attempt>>\n-> Leave it for now\n    <<complete>>\n<<else>>\n${success}\n${effects.join("\n")}\n<<complete>>\n<<endif>>`;
  } else if (route.activities) {
    // A noninteractive original cinematic is presentation inside the same
    // Yarn transaction, not another writable/native progression authority.
    if (!route.activities.length || lines.length || route.staging) throw new Error(`Invalid presentation-only route ${route.id}`);
    if (route.destination && !/^s1\.[a-z0-9.-]+$/.test(route.destination)) throw new Error(`Invalid Story destination ${route.id}`);
    if(route.timeTransition&&!/^s1\.[a-z0-9.-]+$/.test(route.timeTransition))throw Error(`Invalid Story time transition ${route.id}`);
    body = `${route.activities.map(id => `<<start_activity "${id}">>`).join("\n")}\n${route.timeTransition?`<<advance_story_time "${route.timeTransition}">>\n`:""}${route.destination ? `<<travel_story "${route.destination}">>\n` : ""}${effects.join("\n")}\n<<complete>>`;
    if (route.confirmation) {
      const { accept, decline } = route.confirmation;
      if (![accept,decline].every(label=>typeof label==='string' && /^[A-Za-z0-9 .,!?'-]+$/.test(label))) throw new Error(`Invalid confirmation ${route.id}`);
      body = `-> ${accept}\n    <<jump Present>>\n-> ${decline}\n    <<complete>>\n===\ntitle: Present\n---\n${body}`;
    }
  } else {
    const begin=route.staging?`<<play_sequence "${route.staging}.start">>`:participants.map(actor=>`<<look_at_actor "${actor}" "AKIR">>`).join("\n");
    const finish=route.staging?`<<play_sequence "${route.staging}.finish">>`:participants.map(actor=>`<<clear_actor_look "${actor}">>`).join("\n");
    body = `${begin}\n${lines.join("\n")}\n${finish}\n${effects.join("\n")}\n<<complete>>`;
  }
  // complete requests durable settlement; it does not short-circuit Yarn.
  // Conditional early endings jump to an actual terminal node instead.
  const sourceText = `title: Start\ntags: adaptation story disc${disc} ${route.area} ${route.actor}\n---\n<<if ${gates.join(" || ")}>>\n    <<pass_trigger>>\n<<endif>>\n${body}\n===\n${route.combat?"title: Done\n---\n<<complete>>\n===\n":""}`;
  imports.push({ Slug: `story-s1-${route.id}`, Title: route.title,
    Description: route.provenance || spec.provenance, Summary: route.authoredText ? "Original object use with authored unvoiced captions and inspection staging. Explicit choice and final acknowledgement settle personal inventory/notebook through Yarn; cancellation grants nothing." : route.navigation?"Original district geometry, actors and voices; authored server-controlled patrol avoidance. Real door use settles arrival; capture advances the personal calendar and returns to the gate.":route.combat?"Original introduction, server-controlled fight, original clue dialogue. No movie-completion victory or currency/item reward.":route.challenge ? "Personal voiced encounter; explicit server-validated QTE before clue settlement. Authored staging; no item or currency reward." : route.activities ? "Original noninteractive presentation; completion or explicit skip settles the personal milestone/notebook through Yarn. Cancellation or preparation failure settles nothing." : "Personal investigation conversation; original voiced lines, authored sequence, existing NPC facing and gameplay camera. No item or currency reward.",
    NativeSources: [...(source.archiveSources||[source.generatedFrom]).map(info=>({role:"dialogue",locator:`${info.archive}#${route.actor}/${route.id}`,sha256:info.sha256})), ...(route.nativeSources || [])],
    SourceText: sourceText, Triggers: [{ nodeId: "Start", kind: route.trigger || "talk", area: route.area, ...(route.object ? {object:route.object} : route.trigger ? {} : { actor: route.actor }), priority: route.priority ?? 200 }],
    TestFixtures: [{ Name: "Eligible personal investigation", StartNode: "Start", Fixture: {
      playMode: "story", openingCompleted: true, scene: route.area, gameHour: route.hours ? Math.max(10,route.hours[0]) : 10,
      flags: Object.fromEntries(route.requiredFlags.map(flag => [flag, true])),
      ...(requiredItems.length?{inventory:Object.fromEntries(requiredItems.map(({key,quantity})=>[key,quantity]))}:{}),
      actorPresence: Object.fromEntries((route.presentActors || participants).map(actor => [actor, true])),
      ...((route.recordDays?.length||route.combat||route.dayAfter||route.sameDayAs||route.timeTransition)?{gameDate:"1986-12-04"}:{}),
      ...(route.dayAfter?{progress:{[route.dayAfter]:Date.UTC(1986,11,3)/86400000}}:{}),
      ...(route.sameDayAs?{progress:{[route.sameDayAs]:Date.UTC(1986,11,4)/86400000}}:{}),
      ...(route.bounds?{actorBounds:{AKIR:{[route.bounds]:true}}}:{}),
      ...(route.optionSelections?{optionSelections:route.optionSelections}:{}),
      ...(route.randomIntegers?{randomIntegers:route.randomIntegers}:{}),
      ...(route.activityResults?{activityResults:route.activityResults}:{}),
    } }],
  });
  if (route.repeatable) imports.at(-1).Summary = "Repeatable, reward-free room travel with authored unvoiced confirmation. The existing server transaction saves one reviewed destination and idempotent notebook/milestones; leave or cancellation does not travel.";
  if (route.grantYen) imports.at(-1).Summary = "Original presentation followed by once-only personal funds, calendar, location and notebook settlement through the existing server transaction. Cancelled/failed presentation settles nothing; reload cannot repeat the grant.";
}
fs.writeFileSync(path.join(server, "internal/officialscript/early_investigation.generated.json"), JSON.stringify(imports, null, 2) + "\n");
// Runtime authority boundary: translated Story talks cannot silently select a
// different native branch when their server gate passes or is unavailable.
fs.writeFileSync(path.join(root, "play/data/authored-story-talks.json"), JSON.stringify({
  schema: "new-yokosuka-authored-story-talks-v1",
  talks: [...new Map(spec.routes.filter(route => !route.trigger || route.blockNativeTalk)
    .map(({ area, actor }) => [`${area}:${actor}`,{area,actor}])).values()],
  objects: [...new Map(spec.routes.filter(route => route.trigger === "use")
    .map(({area,object,objectLabel})=>[`${area}:${object}`,{area,object,...(objectLabel?{label:objectLabel}:{})}])).values()],
}, null, 2) + "\n");
if (process.argv.includes("--voices")) {
  // The voice pack CLI interprets no --voice-id arguments as the full corpus.
  // A cinematic-only route must not accidentally expand a targeted export.
  if (!exportedVoices.size) throw new Error("Selected routes have no ordinary dialogue voices; use the cinematic package's audio builder");
  if (!process.env.VGMSTREAM_CLI) throw new Error("VGMSTREAM_CLI is required for --voices");
  const temporary = fs.mkdtempSync("/var/tmp/ny-investigation-voices-");
  try {
    const manifest = path.join(temporary, "manifest.json");
    const sourceFile = path.join(temporary, "sources.json");
    const sources = JSON.parse(fs.readFileSync(path.join(root, ".disc-work/dialogue/actor-dialogue-voice-sources.json")));
    sources.voices.push(...streamVoices.values());
    fs.writeFileSync(sourceFile, JSON.stringify(sources));
    execFileSync("python3", ["-m", "tools.scripting.build_dialogue_voice_pack", "--sources", sourceFile, ...[...exportedVoices].flatMap(id => ["--voice-id", id]),
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
    // Ignored extraction files need explicit immutable asset records. Updating
    // only existing records would leave new voices on bare local URLs and make
    // clean builds unable to fetch them after separately authorized publication.
    execFileSync(process.execPath,["tools/runtime-assets.mjs","update","public/audio/dialogue/manifest.json",
      ...existing.lines.filter(line=>exportedVoices.has(line.voiceId)).map(line=>`public${line.url}`)],{cwd:root,stdio:"inherit"});
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
console.log(`Generated ${imports.length} official conversations (${voices.size} original voice lines).`);
