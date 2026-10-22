// Documentation inventory only. Source branches and review cases are deliberately
// kept separate from the count of distinct, named gameplay interruptions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const conversationOutput = "docs/reference/shenmue1-story-conversations.generated.md";
export const sourceInput = "tools/evidence/shenmue1-story-event-sources.generated.json";
const normalize = text => String(text || "").replace(/\s+/g, " ").trim();
const clip = (text, limit = 150) => text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
export const cell = value => normalize(value || "—").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "\\|");
export const anchor = id => id.toLowerCase().replaceAll(".", "-");
const calendarTopic = /\b(?:Christmas|Santa|New Year(?:['’]s)?)\b/i;

export async function loadConversations(root, source) {
  assert.equal(source.schema, "shenmue1-story-event-sources-v1");
  const result = [];
  const seen = new Set();
  for (const resource of source.resources) {
    // A changed corpus with nonidentical copies requires explicit variant IDs,
    // not silently combining two different scripts under one character.
    assert(!seen.has(resource.actor), `multiple source variants for ${resource.actor}`);
    seen.add(resource.actor);
    const file = `play/data/dialogue/messages/${resource.actor}.generated.js`;
    const fullPath = path.join(root, file);
    let messages = new Map();
    let label = resource.actor;
    if (fs.existsSync(fullPath)) {
      const { NATIVE_DIALOGUE_MESSAGE_RESOURCE: data } = await import(pathToFileURL(fullPath).href);
      assert.equal(data.actorCode, resource.actor);
      assert.equal(data.generatedFrom.sha256, source.humansSha256, `source mismatch: ${file}`);
      messages = new Map(data.messages.map(message => [message.index, message]));
      assert.equal(messages.size, data.messages.length, `duplicate message index: ${file}`);
      label = data.actorLabel || resource.actor;
    }
    for (const entry of resource.entries) {
      const lines = entry.messages.map(index => {
        if (!fs.existsSync(fullPath)) return {index, unavailable: true};
        assert(messages.has(index), `missing ${resource.actor} message ${index}`);
        return messages.get(index);
      });
      result.push({...entry, actor: resource.actor, label, sha256: resource.sha256,
        id: `conversation.${resource.actor}.${entry.marker}`, lines,
        messageFile: fs.existsSync(fullPath) ? file : null,
        calendarLines: lines.filter(line => calendarTopic.test(line.displayText || ""))});
    }
  }
  assert.equal(result.length, source.summary.uniqueConversationEntries);
  assert.equal(new Set(result.map(entry => entry.id)).size, result.length, "duplicate native entry");
  return result;
}

export function expandFamilies({inventory, events, source, conversations, challenges, encounters}) {
  const eventById = new Map(events.map(event => [event.id, event]));
  const knownEvents = new Set(eventById.keys());
  const families = events.filter(event => /family/i.test(event.kind));
  assert.deepEqual(Object.keys(inventory.expansions).sort(), families.map(event => event.id).sort(),
    "every family needs exactly one expansion");
  const voiceEntries = new Map();
  for (const entry of conversations) for (const line of entry.lines) {
    if (!line.voiceId) continue;
    if (!voiceEntries.has(line.voiceId)) voiceEntries.set(line.voiceId, new Set());
    voiceEntries.get(line.voiceId).add(entry.id);
  }
  const sections = families.map(family => {
    const definition = inventory.expansions[family.id];
    const rows = (definition.events || []).map(event => ({...event,
      id: `${family.id}.${event.id}`, sources: event.sources || [], kind: "Source-backed topic/response"}));
    if (definition.method === "native-conversations") {
      // Linked in full in a separate appendix, not another 4,000 main-table rows.
      return {...family, ...definition, rows, nativeCount: conversations.length};
    }
    if (definition.method === "native-calendar") {
      for (const entry of conversations.filter(entry => entry.calendarLines.length)) {
        rows.push({id: `${family.id}.${entry.actor}.${entry.marker}`,
          name: `${entry.label}: ${clip(entry.calendarLines[0].displayText, 100)}`,
          kind: "Native conversation branch", sources: ["native-voices", "dialogue-bodies"],
          related: [entry.id], excerpt: entry.calendarLines.map(line =>
            `${line.voiceId}: ${normalize(line.displayText)}`).join(" / ")});
      }
    } else if (definition.method === "challenge-cases") {
      const assigned = new Set();
      const ordinary = new Map(challenges.filter(challenge => !challenge.kind || challenge.kind === "qte")
        .map(challenge => [challenge.id, challenge]));
      for (const [id, name, ids] of definition.groups) {
        for (const challenge of ids) {
          assert(ordinary.has(challenge), `unknown QTE segment ${challenge}`);
          assert(!assigned.has(challenge), `QTE segment assigned twice: ${challenge}`);
          assigned.add(challenge);
        }
        rows.push({id: `${family.id}.${id}`, name: `${name}: miss, recovery and retry`,
          kind: "Review case", sources: ["challenges"], binding: ids.join(", "),
          note: "Identify distinct original miss reactions within this encounter; button segments are not separate event counts."});
      }
      assert.deepEqual([...ordinary.keys()].filter(id => !assigned.has(id)), [], "unclassified QTE segment");
    } else if (definition.method === "combat-cases") {
      const twoWaves = ["s1.mfsy.workday-two-wave-one", "s1.mfsy.workday-two-wave-two"];
      assert(twoWaves.every(id => encounters.some(encounter => encounter.id === id)), "missing workday wave");
      for (const encounter of encounters.filter(encounter => !encounter.training)) {
        if (encounter.id === twoWaves[1]) continue;
        const spar = encounter.id === "s1.jhd0.fuku-practice";
        rows.push({id: `${family.id}.${encounter.id}`, name: spar
          ? "Fuku-san sparring: stop or lose the practice session"
          : `${encounter.id === twoWaves[0] ? "Two-wave warehouse ambush" : encounter.label}: defeat and recovery`,
        kind: "Review case", sources: ["combat"],
        binding: encounter.id === twoWaves[0] ? twoWaves.join(", ") : encounter.id,
        ...(encounter.id === "s1.dgct.chai-arcade" ? {aliasOf: "story.chai-arcade.loss"} : {}),
        note: spar ? "Practice outcome, not a hostile fight or an invented game-over scene."
          : "Encounter exists in the adaptation; original defeat film, money loss and restart point remain unverified."});
      }
    } else if (definition.method === "workday-cases") {
      for (const chapter of inventory.chapters.filter(chapter => /^work[1-5]$/.test(chapter.id))) {
        rows.push({id: `${family.id}.${chapter.id}`, name: `${chapter.title}: unmet progression / repeat-day review`,
          kind: "Review case", sources: ["routes"], binding: chapter.routes.map(id => `route:${id}`).join(", "),
          note: "Review this day's listed story encounters; this list does not assert that every route is an original repeat-day requirement. Delivery quota is a separate result."});
      }
    } else assert(["curated", "native-related"].includes(definition.method), `unknown expansion ${definition.method}`);

    for (const row of rows) {
      for (const target of [row.aliasOf, row.caseFor].filter(Boolean)) {
        assert(knownEvents.has(target), `unknown parent event ${target}`);
      }
      if (row.caseFor) row.kind = "Review case";
      if (row.aliasOf) row.kind = "Existing event alias";
      if (row.voices?.length) {
        for (const voice of row.voices) assert(source.voices[voice]?.length, `missing subtitle evidence ${voice}`);
        row.sources = [...new Set([...row.sources, "native-voices"])];
        row.excerpt = row.voices.flatMap(voice => source.voices[voice].map(variant =>
          `${voice}: ${normalize(variant.text)}`)).join(" / ");
        if (definition.method === "native-related") {
          row.related = [...new Set(row.voices.flatMap(voice => [...(voiceEntries.get(voice) || [])]))];
          assert(row.related.length, `no native entry selects relationship topic ${row.id}`);
        }
      }
      if (row.caseFor && !row.sources.length) row.sources = eventById.get(row.caseFor).sources;
      assert(row.sources.length, `missing evidence ${row.id}`);
    }
    return {...family, ...definition, rows};
  });
  const rows = sections.flatMap(section => section.rows);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, "duplicate expansion ID");
  for (const row of rows) assert(!knownEvents.has(row.id), `expansion duplicates existing ID ${row.id}`);
  return {sections, counts: {
    rows: rows.length,
    topics: rows.filter(row => row.kind === "Source-backed topic/response").length,
    aliases: rows.filter(row => row.aliasOf).length,
    cases: rows.filter(row => row.kind === "Review case").length,
    calendar: rows.filter(row => row.kind === "Native conversation branch").length,
  }};
}

export function renderExpansions(sections, sourceRef, ref) {
  const lines = ["## Expanded event groups", "",
    "These replace the twelve previously unexpanded groups. Topic rows group related original lines; they are not assertions of playback order. **Review cases** identify concrete encounters whose original outcome still needs checking. **Aliases** point to existing main-list entries and add no event. Holiday rows are a view of the conversation appendix, not extra conversations.", ""];
  for (const section of sections) {
    lines.push(`<a id="expanded-${anchor(section.id)}"></a>`, `### ${section.name}`, "", section.note, "");
    if (section.nativeCount) {
      lines.push(`${ref("Complete conversation appendix", conversationOutput)}: ${section.nativeCount} distinct actor-resource entry markers, with character names, representative dialogue, native locations and unresolved decoding boundaries. This includes ${sourceRef("dialogue-bodies")} provenance. It does not establish that every branch is reachable during ordinary play.`, "");
      continue;
    }
    lines.push("| ID | Event or outcome | Evidence / exact locator | Classification and remaining work |",
      "| --- | --- | --- | --- |");
    for (const row of section.rows) {
      const related = (row.related || []).map(id => ref(id, `${conversationOutput}#${anchor(id)}`));
      const evidence = [row.sources.map(sourceRef).join(", "), row.binding ? `\`${row.binding}\`` : "",
        row.excerpt ? cell(row.excerpt) : "", related.join(", ")].filter(Boolean).join("<br>");
      const detail = [row.kind, row.aliasOf ? `See \`${row.aliasOf}\`; not counted again.` : "",
        row.caseFor ? `Parent: \`${row.caseFor}\`.` : "", row.note || "",
        row.kind === "Source-backed topic/response" ? "Original trigger and full presentation unreviewed." : ""].filter(Boolean).join(" ");
      lines.push(`| \`${row.id}\` | ${cell(row.name)} | ${evidence} | ${cell(detail)} |`);
    }
    lines.push("");
  }
  return lines;
}

export function renderConversations(conversations, source, reviewed) {
  const ref = (label, file) => `[${label}](${path.relative(path.dirname(conversationOutput), file)})`;
  const groups = Map.groupBy(conversations, entry => entry.actor);
  const noLines = conversations.filter(entry => !entry.lines.length).length;
  const unavailable = conversations.filter(entry => entry.lines.some(line => line.unavailable)).length;
  const boundaries = conversations.filter(entry => entry.dynamicBoundaries || entry.nestedBoundaries.length ||
    entry.terminations.some(kind => kind !== "conversationLifecycleTransition")).length;
  const lines = ["# Shenmue I conversation entry appendix", "",
    `Reviewed ${reviewed}. Generated alongside the [master event list](shenmue1-story-event-master.generated.md); do not edit this output.`, "",
    `**${conversations.length} source entry markers across ${groups.size} unique actor resources.** The original archive contains ${source.summary.physicalConversationEntries} physical entries; repeated identical actor resources are counted once. These are conversation branches, not ${conversations.length} additional unique story events. Named plot conversations in the master list can occur here too.`, "",
    "This appendix makes the ordinary-dialogue family inspectable without treating every subtitle or camera cut as an event. Each row is an original actor-resource entry selected by the existing native decoder. A representative question or reply helps find a topic; it is not a reconstructed transcript, execution order or a claim that alternate branches all play together.", "",
    `Source: ${ref("compact native index", sourceInput)}; ${ref("existing selector/body decoder", "tools/scripting/extract_dialogue_actor_body_routes.py")}; archive SHA-256 \`${source.humansSha256}\`. HUMANS copies on discs ${source.identicalHumansDiscs.join(", ")} were verified byte-identical. The index retains each resource hash, original archive copies, entry/body offsets, numeric predicate identities, all decoded message indices and decoder boundaries. Character message links supply text and voice IDs.`, "",
    `**Limits:** ${noLines} entries have no statically recovered spoken lines; ${unavailable} have no matching localized message catalog; ${boundaries} encounter dynamic, nested or progress-redirection boundaries. Those rows remain visible. A lifecycle return alone does not prove original eligibility or runtime support. Exact story/date predicates, semantic deduplication, unreachable content and presentation readiness still require review.`, "",
    "## Characters", "",
    ...[...groups.entries()].map(([actor, entries]) => `- [${cell(entries[0].label)} (${actor})](#actor-${actor.toLowerCase()}) — ${entries.length} entries`), ""];
  for (const [actor, entries] of groups) {
    const first = entries[0];
    lines.push(`<a id="actor-${actor.toLowerCase()}"></a>`, `## ${first.label} (${actor})`, "",
      `Resource SHA-256: \`${first.sha256}\`. ${first.messageFile ? ref("Original message catalog", first.messageFile) : "Localized message catalog unavailable; numeric selections retained."}`, "",
      "| Entry ID | Representative original dialogue | Native body / decoded selections | Research boundary |",
      "| --- | --- | --- | --- |");
    for (const entry of entries) {
      const usable = entry.lines.filter(line => line.displayText?.trim());
      const question = usable.find(line => line.speakerId === "AKIR" && line.displayText.includes("?") && line.displayText.length > 20);
      const reply = usable.find(line => line.speakerId !== "AKIR" && line.displayText.length > 30);
      const samples = [...new Set([question, reply].filter(Boolean))];
      if (!samples.length && usable.length) samples.push(usable.find(line => line.displayText.length > 15) || usable[0]);
      const excerpt = samples.map(line => `${line.voiceId}: “${clip(normalize(line.displayText))}”`).join(" / ");
      const boundary = [entry.dynamicBoundaries ? `${entry.dynamicBoundaries} dynamic boundary/boundaries` : "",
        ...entry.nestedBoundaries, ...entry.terminations.filter(kind => kind !== "conversationLifecycleTransition")];
      lines.push(`| <a id="${anchor(entry.id)}"></a>\`${entry.id}\` | ${cell(excerpt || (entry.lines.length ? "Localized text unavailable" : "No spoken selections recovered before lifecycle handoff"))} | \`${entry.body}\`; ${entry.messages.length} line selections | ${cell(boundary.join("; ") || "Eligibility and presentation unreviewed")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
