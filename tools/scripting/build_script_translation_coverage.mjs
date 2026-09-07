import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres@127.0.0.1:55434/new_yokosuka?sslmode=disable";
const SOURCE = ".disc-work/dialogue/interaction-candidates.json";
const SUMMARY_OUTPUT = "tools/evidence/script-translation-coverage.json";
const FULL_OUTPUT = ".disc-work/dialogue/script-translation-coverage.json";

const IMPLEMENTED = new Set(["translated", "specialized-activity-owned"]);
const SOURCE_INCOMPLETE = new Set([
  "ambiguous-subtitle-provenance",
  "missing-subtitle-provenance",
  "no-recovered-launch-path",
  "unresolved-dynamic-scheduler-root",
]);

export function candidateKey(candidate) {
  return [
    candidate.disc,
    candidate.area,
    candidate.executableTargetIndex,
    candidate.regionStartFileOffset,
  ].join(":");
}

function requireOwnership(record) {
	if (!IMPLEMENTED.has(record?.ownership)) {
		throw new Error(`unsupported coverage ownership ${record?.ownership}`);
	}
	if (typeof record.scriptSlug !== "string" || !record.scriptSlug) {
		throw new Error("coverage ownership requires a script slug");
	}
	if (typeof record.evidenceLocator !== "string" || !record.evidenceLocator) {
		throw new Error("coverage ownership requires exact evidence");
	}
	if (
		record.ownership === "specialized-activity-owned"
		&& (typeof record.activityId !== "string" || !record.activityId)
	) {
		throw new Error("specialized activity coverage requires an activity ID");
	}
}

export function classifyCoverage(candidates, ownershipRecords) {
  const byCandidate = new Map(candidates.map(candidate => [candidateKey(candidate), candidate]));
  if (byCandidate.size !== candidates.length) {
    throw new Error("recovered dialogue candidate identities are not unique");
  }
	const ownerships = new Map();
	for (const ownership of ownershipRecords) {
		requireOwnership(ownership);
		const key = candidateKey(ownership.candidate || {});
		if (!byCandidate.has(key)) throw new Error(`coverage mapping ${key} has no recovered candidate`);
		if (ownerships.has(key)) throw new Error(`duplicate coverage mapping ${key}`);
		if (ownership.contentFormat !== "yarn" || ownership.compileStatus !== "valid") {
			throw new Error(`mapped script ${ownership.scriptSlug} is not valid published Yarn`);
		}
		ownerships.set(key, ownership);
	}

	const records = candidates.map(candidate => {
		const ownership = ownerships.get(candidateKey(candidate));
		if (ownership) {
      return {
        candidate: {
          disc: candidate.disc,
          area: candidate.area,
          executableTargetIndex: candidate.executableTargetIndex,
          regionStartFileOffset: candidate.regionStartFileOffset,
        },
			classification: ownership.ownership,
        mapping: {
				scriptSlug: ownership.scriptSlug,
				activityId: ownership.activityId || null,
				evidence: ownership.evidenceLocator,
				publishedVersion: ownership.version,
				commandSchemaVersion: ownership.commandSchemaVersion,
        },
        sourceUnresolved: candidate.unresolved,
        unresolved: [],
      };
    }
    const sourceIncomplete = candidate.unresolved.some(issue => SOURCE_INCOMPLETE.has(issue));
    return {
      candidate: {
        disc: candidate.disc,
        area: candidate.area,
        executableTargetIndex: candidate.executableTargetIndex,
        regionStartFileOffset: candidate.regionStartFileOffset,
      },
      classification: sourceIncomplete ? "unresolved" : "native-reference-only",
      mapping: null,
      sourceUnresolved: candidate.unresolved,
      unresolved: candidate.unresolved,
    };
  });

  const counts = Object.fromEntries([
    "translated",
    "specialized-activity-owned",
    "native-reference-only",
    "unresolved",
  ].map(classification => [
    classification,
    records.filter(record => record.classification === classification).length,
  ]));
  const implementedCount = counts.translated + counts["specialized-activity-owned"];
  const areas = {};
  for (const record of records) {
    const area = record.candidate.area;
    areas[area] ||= { total: 0, translated: 0, "specialized-activity-owned": 0, "native-reference-only": 0, unresolved: 0 };
    areas[area].total += 1;
    areas[area][record.classification] += 1;
  }
  return {
    records,
    summary: {
      candidateCount: records.length,
      ...counts,
      implementedCount,
      implementedPercent: Number((implementedCount * 100 / records.length).toFixed(2)),
      translatedPercent: Number((counts.translated * 100 / records.length).toFixed(2)),
      specializedActivityOwnedPercent: Number((counts["specialized-activity-owned"] * 100 / records.length).toFixed(2)),
      nativeReferenceOnlyPercent: Number((counts["native-reference-only"] * 100 / records.length).toFixed(2)),
      unresolvedPercent: Number((counts.unresolved * 100 / records.length).toFixed(2)),
    },
    areas,
  };
}

function loadPublishedOwnerships(databaseUrl) {
	const query = `select coalesce(json_agg(row_to_json(ownership_rows)), '[]'::json)::text
		from (
			select s.slug as "scriptSlug", v.version,
			       v.content_format as "contentFormat",
			       v.compile_status as "compileStatus",
			       coalesce(v.command_schema_version, '') as "commandSchemaVersion",
			       r.disc, r.area,
			       r.executable_target_index as "executableTargetIndex",
			       r.region_start_file_offset as "regionStartFileOffset",
			       r.ownership, coalesce(r.activity_id, '') as "activityId",
			       r.evidence_locator as "evidenceLocator"
			  from scripts s
			  join script_versions v on v.id = s.current_published_version_id
			  join script_version_native_dialogue_regions r on r.version_id = v.id
			 where s.archived_at is null
			 order by s.slug, r.ordinal
		) ownership_rows`;
	const output = execFileSync("psql", [databaseUrl, "-At", "-c", query], {
		encoding: "utf8",
	});
	return JSON.parse(output).map(record => ({
		...record,
		candidate: {
			disc: record.disc,
			area: record.area,
			executableTargetIndex: record.executableTargetIndex,
			regionStartFileOffset: `0x${Number(record.regionStartFileOffset).toString(16)}`,
		},
	}));
}

async function main() {
	const source = await readFile(SOURCE, "utf8").then(JSON.parse);
	if (!Array.isArray(source.candidates)) {
		throw new Error("script coverage inputs have an unsupported schema");
	}
	const databaseUrl = process.env.NEW_YOKOSUKA_DATABASE_URL || DEFAULT_DATABASE_URL;
	const coverage = classifyCoverage(source.candidates, loadPublishedOwnerships(databaseUrl));
  const full = {
    schema: "new-yokosuka-script-translation-coverage-v1",
    evidenceBoundary: [
      "The denominator is the 1,285 exact executable dialogue-region candidates in the recovered corpus, not all native functions or engine calls.",
      "Implemented classifications require an explicit reviewed candidate mapping and a currently published, valid Yarn version in PostgreSQL.",
      "Native-reference-only means source provenance and a launch path are complete enough to preserve the candidate; it does not mean a trigger route or executable translation exists.",
      "Unresolved means subtitle provenance, launch ownership, or a dynamic scheduler root remains incomplete. No name, voice, actor, area, or proximity matching fills those gaps.",
      "For an explicitly reviewed implemented mapping, sourceUnresolved preserves the earlier extraction queue while unresolved is empty: the published ownership and exact evidence locator are the reviewed resolution, not an inferred match."
    ],
		generatedFrom: { candidates: SOURCE, ownership: "PostgreSQL current published script versions", database: databaseUrl },
    ...coverage,
  };
  const summary = {
    schema: "new-yokosuka-script-translation-coverage-summary-v1",
    evidenceBoundary: full.evidenceBoundary,
    summary: full.summary,
    areas: full.areas,
    mappings: full.records.filter(record => IMPLEMENTED.has(record.classification)),
    fullReport: FULL_OUTPUT,
  };
  await Promise.all([
    writeFile(FULL_OUTPUT, `${JSON.stringify(full, null, 2)}\n`),
    writeFile(SUMMARY_OUTPUT, `${JSON.stringify(summary, null, 2)}\n`),
  ]);
  process.stdout.write(`${JSON.stringify(full.summary)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
