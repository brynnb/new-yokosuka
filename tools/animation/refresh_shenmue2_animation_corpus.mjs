#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveShenmue2NativeMotionId } from "../../src/Shenmue2MotLoader.js";
import {
  SHENMUE2_SPECIAL_ACTOR_CODES,
} from "../lib/Shenmue2SpecialActorBinding.js";

function parseArguments(argv) {
  const options = {
    capturesDirectory: "captures/pvr",
    bindingsDirectories: [],
    fixturesDirectory: "tests/fixtures/shenmue2-animation",
    fixtureReportDirectory: null,
    charactersDirectory: "play/assets/shenmue2-characters",
    coveragePath: "tools/evidence/shenmue2-animation-coverage.json",
    familyConformancePath:
      "tools/evidence/shenmue2-animation-family-conformance.json",
    humansIndexPath: ".disc-work/shenmue2-disc1-native-npc/HUMANS.IDX",
    humansArchivePath: ".disc-work/shenmue2-disc1-native-npc/HUMANS.AFS",
    reportPath: ".disc-work/shenmue2-animation-corpus-refresh.json",
    transactionWorker: false,
    rebuildAll: false,
  };
  const names = new Map([
    ["--captures-dir", "capturesDirectory"],
    ["--bindings-dir", "bindingsDirectory"],
    ["--fixtures-dir", "fixturesDirectory"],
    ["--fixtures-report-dir", "fixtureReportDirectory"],
    ["--characters-dir", "charactersDirectory"],
    ["--coverage", "coveragePath"],
    ["--family-conformance", "familyConformancePath"],
    ["--humans-idx", "humansIndexPath"],
    ["--humans-afs", "humansArchivePath"],
    ["--report", "reportPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--transaction-worker") {
      options.transactionWorker = true;
      continue;
    }
    if (argv[index] === "--rebuild-all") {
      options.rebuildAll = true;
      continue;
    }
    const property = names.get(argv[index]);
    const value = argv[++index];
    if (!property || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${argv[index] || ""}`);
    }
    if (argv[index - 1] === "--bindings-dir") {
      options.bindingsDirectories.push(value);
    } else {
      options[property] = value;
    }
  }
  if (!options.bindingsDirectories.length) {
    options.bindingsDirectories.push(".disc-work");
  }
  const resolved = { ...options };
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "string") resolved[key] = path.resolve(value);
  }
  resolved.bindingsDirectories = options.bindingsDirectories.map(
    (directory) => path.resolve(directory),
  );
  resolved.bindingsDirectory = resolved.bindingsDirectories[0];
  resolved.fixtureReportDirectory = options.fixtureReportDirectory
    ? path.resolve(options.fixtureReportDirectory)
    : resolved.fixturesDirectory;
  return resolved;
}

function recursiveFiles(directory, basename) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return recursiveFiles(filename, basename);
      return entry.isFile() && entry.name === basename ? [filename] : [];
    });
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((filename) => filename.endsWith(".json"))
    .map((filename) => path.join(directory, filename));
}

function recursiveJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return recursiveJsonFiles(filename);
      return entry.isFile() && entry.name.endsWith(".json") ? [filename] : [];
    });
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function runNode(script, args, { quiet = false } = {}) {
  const result = childProcess.spawnSync(
    process.execPath,
    [script, ...args],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  return result;
}

function atomicWriteJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.refresh-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function copyRuntimeBindingReports(sourceDirectories, destinationDirectory) {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const existingContents = new Set(jsonFiles(destinationDirectory).map(
    (filename) => fs.readFileSync(filename, "utf8"),
  ));
  const copied = [];
  for (const sourceDirectory of sourceDirectories) {
    for (const source of recursiveJsonFiles(sourceDirectory)) {
      let value;
      try {
        value = readJson(source);
      } catch {
        continue;
      }
      if (
        value.schema
        !== "new-yokosuka-shenmue2-runtime-controller-bindings-v2"
      ) continue;
      const contents = fs.readFileSync(source, "utf8");
      if (existingContents.has(contents)) continue;
      const parsed = path.parse(source);
      let destination = path.join(destinationDirectory, parsed.base);
      for (let suffix = 2; fs.existsSync(destination); suffix += 1) {
        destination = path.join(
          destinationDirectory,
          `${parsed.name}-${suffix}${parsed.ext}`,
        );
      }
      fs.copyFileSync(source, destination);
      existingContents.add(contents);
      copied.push(destination);
    }
  }
  return copied;
}

function replacePublishedCorpus(stage, destination, validatePublished) {
  const replacements = [
    [stage.fixturesDirectory, destination.fixturesDirectory, true],
    [stage.coveragePath, destination.coveragePath, false],
    [stage.familyConformancePath, destination.familyConformancePath, false],
  ];
  const backups = [];
  try {
    for (const [source, target, isDirectory] of replacements) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const backup = `${target}.refresh-backup-${process.pid}`;
      if (fs.existsSync(backup)) {
        fs.rmSync(backup, { recursive: true, force: true });
      }
      if (fs.existsSync(target)) {
        fs.renameSync(target, backup);
        backups.push([target, backup]);
      } else {
        backups.push([target, null]);
      }
      fs.renameSync(source, target);
      if (isDirectory && !fs.statSync(target).isDirectory()) {
        throw new Error(`Published fixture target is not a directory: ${target}`);
      }
    }
    validatePublished();
  } catch (error) {
    for (const [target, backup] of backups.reverse()) {
      fs.rmSync(target, { recursive: true, force: true });
      if (backup && fs.existsSync(backup)) fs.renameSync(backup, target);
    }
    throw error;
  }
  for (const [, backup] of backups) {
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
  }
}

function normalizeReportPaths(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeReportPaths(entry, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      normalizeReportPaths(entry, replacements),
    ]));
  }
  if (typeof value !== "string") return value;
  return replacements.reduce(
    (result, [from, to]) => result.split(from).join(to),
    value,
  );
}

function runTransactionalRefresh(destination) {
  const stagingRoot = fs.mkdtempSync(path.join(
    path.dirname(destination.fixturesDirectory),
    ".shenmue2-animation-refresh-",
  ));
  const stage = {
    fixturesDirectory: path.join(stagingRoot, "fixtures"),
    bindingsDirectory: path.join(stagingRoot, "bindings"),
    coveragePath: path.join(stagingRoot, "coverage.json"),
    familyConformancePath: path.join(stagingRoot, "family-conformance.json"),
    reportPath: path.join(stagingRoot, "report.json"),
  };
  try {
    if (fs.existsSync(destination.fixturesDirectory)) {
      fs.cpSync(destination.fixturesDirectory, stage.fixturesDirectory, {
        recursive: true,
      });
    } else {
      fs.mkdirSync(stage.fixturesDirectory, { recursive: true });
    }
    copyRuntimeBindingReports(
      destination.bindingsDirectories,
      stage.bindingsDirectory,
    );
    const workerArguments = [
      "--transaction-worker",
      "--captures-dir", destination.capturesDirectory,
      "--bindings-dir", stage.bindingsDirectory,
      "--fixtures-dir", stage.fixturesDirectory,
      "--fixtures-report-dir", stage.fixturesDirectory,
      "--characters-dir", destination.charactersDirectory,
      "--coverage", stage.coveragePath,
      "--family-conformance", stage.familyConformancePath,
      "--humans-idx", destination.humansIndexPath,
      "--humans-afs", destination.humansArchivePath,
      "--report", stage.reportPath,
    ];
    if (destination.rebuildAll) workerArguments.push("--rebuild-all");
    const worker = childProcess.spawnSync(
      process.execPath,
      [process.argv[1], ...workerArguments],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    if (worker.status !== 0) {
      if (fs.existsSync(stage.reportPath)) {
        atomicWriteJson(destination.reportPath, readJson(stage.reportPath));
      }
      return worker.status ?? 1;
    }

    const stagedFixturePath = path.relative(
      process.cwd(),
      stage.fixturesDirectory,
    );
    const publishedFixturePath = path.relative(
      process.cwd(),
      destination.fixturesDirectory,
    );
    atomicWriteJson(
      stage.coveragePath,
      normalizeReportPaths(readJson(stage.coveragePath), [[
        stagedFixturePath,
        publishedFixturePath,
      ]]),
    );

    const importedBindings = copyRuntimeBindingReports(
      [stage.bindingsDirectory],
      destination.bindingsDirectory,
    );
    try {
      replacePublishedCorpus(stage, destination, () => {
        const validation = runNode(
          "tools/animation/build_shenmue2_animation_family_conformance.mjs",
          [
            "--coverage", destination.coveragePath,
            "--out", destination.familyConformancePath,
            "--check",
            "--strict",
          ],
          { quiet: true },
        );
        if (validation.status !== 0) {
          throw new Error(
            validation.stderr
            || validation.stdout
            || "published family conformance validation failed",
          );
        }
      });
    } catch (error) {
      for (const filename of importedBindings) fs.rmSync(filename, { force: true });
      throw error;
    }
    const stagedBindingPath = path.relative(
      process.cwd(),
      stage.bindingsDirectory,
    );
    const publishedBindingPath = path.relative(
      process.cwd(),
      destination.bindingsDirectory,
    );
    const normalizedReport = normalizeReportPaths(readJson(stage.reportPath), [
      [stagedFixturePath, publishedFixturePath],
      [stagedBindingPath, publishedBindingPath],
    ]);
    atomicWriteJson(destination.reportPath, normalizedReport);
    return 0;
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function existingBindingSources(directory) {
  const sources = new Set();
  for (const filename of jsonFiles(directory)) {
    let report;
    try {
      report = readJson(filename);
    } catch {
      continue;
    }
    if (
      report.schema === "new-yokosuka-shenmue2-runtime-controller-bindings-v2"
      && report.source?.ramPath
      && report.source.captureTiming
      && SHENMUE2_SPECIAL_ACTOR_CODES.every(
        (actorCode) => report.method?.specialActorCodes?.includes(actorCode),
      )
    ) {
      sources.add(path.resolve(report.source.ramPath));
    }
  }
  return sources;
}

function fixtureId(candidate) {
  return `${candidate.motionId.slice(2)}-${candidate.modelCodes[0].toLowerCase()}-native`;
}

function motionBankPath(motionId) {
  const resolved = resolveShenmue2NativeMotionId(Number(motionId));
  const banks = {
    motion: "play/assets/shenmue2-motion/MOTION.MOT",
    npc: "play/assets/shenmue2-motion/NPC.MOT",
    npcTable: "play/assets/shenmue2-motion/NPC_TBL.MOT",
  };
  return resolved ? banks[resolved.bank] : null;
}

function regressionThresholdArguments(fixture) {
  const thresholds = fixture.regressionThresholds || {};
  const names = {
    maximumPelvisPositionError: "--regression-pelvis-position",
    maximumPelvisOrientationErrorDegrees: "--regression-pelvis-orientation",
    maximumDecodedPelvisOrientationErrorDegrees:
      "--regression-decoded-pelvis-orientation",
    maximumHorizontalRootDrift: "--regression-horizontal-root-drift",
    maximumPointError: "--regression-point",
    maximumOrientationErrorDegrees: "--regression-orientation",
    maximumBendErrorDegrees: "--regression-bend",
    maximumLengthError: "--regression-length",
  };
  return Object.entries(names).flatMap(([property, argument]) => (
    Number.isFinite(Number(thresholds[property]))
      ? [argument, String(thresholds[property])]
      : []
  ));
}

const options = parseArguments(process.argv.slice(2));
if (!options.transactionWorker) {
  process.exit(runTransactionalRefresh(options));
}
fs.mkdirSync(options.bindingsDirectory, { recursive: true });
fs.mkdirSync(options.fixturesDirectory, { recursive: true });

const report = {
  schema: "new-yokosuka-shenmue2-animation-corpus-refresh-v1",
  generatedAt: new Date().toISOString(),
  captureCount: 0,
  existingBindingReportCount: 0,
  generatedBindingReports: [],
  bindingFailures: [],
  candidateCount: 0,
  strictFixturesAdded: [],
  strictFixturesRebuilt: [],
  strictFixturesUnchanged: [],
  strictFixturesReclassified: [],
  discrepancyFixturesAdded: [],
  discrepancyFixturesRebuilt: [],
  discrepancyFixturesUnchanged: [],
  resolvedDiscrepanciesPromoted: [],
  fixtureBuildFailures: [],
  familyConformanceFailure: null,
};

const ramPaths = recursiveFiles(options.capturesDirectory, "ram.bin");
const knownSources = existingBindingSources(options.bindingsDirectory);
report.captureCount = ramPaths.length;
report.existingBindingReportCount = knownSources.size;

for (const [index, ramPath] of ramPaths.entries()) {
  const absoluteRamPath = path.resolve(ramPath);
  if (knownSources.has(absoluteRamPath)) continue;
  const captureName = path.basename(path.dirname(ramPath));
  const outputPath = path.join(
    options.bindingsDirectory,
    `${captureName}-s2-bindings.json`,
  );
  process.stderr.write(
    `Extracting native bindings ${index + 1}/${ramPaths.length}: ${captureName}\n`,
  );
  const result = runNode(
    "tools/actors/extract_shenmue2_runtime_controller_bindings.js",
    [
      absoluteRamPath,
      "--humans-idx", options.humansIndexPath,
      "--out", outputPath,
    ],
    { quiet: true },
  );
  if (result.status === 0) {
    report.generatedBindingReports.push(path.relative(process.cwd(), outputPath));
    knownSources.add(absoluteRamPath);
  } else {
    report.bindingFailures.push({
      capture: captureName,
      error: (result.stderr || result.stdout || "binding extractor failed").trim(),
    });
  }
}

const coverageArguments = [
  "--bindings-dir", options.bindingsDirectory,
  "--fixtures-dir", options.fixturesDirectory,
  "--fixtures-report-dir", options.fixtureReportDirectory,
  "--characters-dir", options.charactersDirectory,
  "--humans-index", options.humansIndexPath,
  "--humans-archive", options.humansArchivePath,
  "--out", options.coveragePath,
];
let coverageResult = runNode(
  "tools/animation/build_shenmue2_animation_coverage.mjs",
  coverageArguments,
);
if (coverageResult.status !== 0) {
  throw new Error("Could not rebuild Shenmue II animation coverage");
}

let coverage = readJson(options.coveragePath);
const candidates = (coverage.nativeFixtureSourceCandidates || []).filter(
  (candidate) => (
    candidate.completePoseCaptureCount > 0
    && candidate.exactActorModelBindingCount === 1
    && candidate.actorCodes.length === 1
    && candidate.modelCodes.length === 1
    && candidate.existingFixtureIds.length === 0
    && fs.existsSync(path.join(
      options.charactersDirectory,
      `${candidate.modelCodes[0]}.CHRM`,
    ))
  ),
);
report.candidateCount = candidates.length;

const discrepancyDirectory = path.join(options.fixturesDirectory, "discrepancies");
for (const candidate of candidates) {
  const id = fixtureId(candidate);
  const strictPath = path.join(options.fixturesDirectory, `${id}.json`);
  const discrepancyPath = path.join(discrepancyDirectory, `${id}.json`);
  if (fs.existsSync(strictPath) || fs.existsSync(discrepancyPath)) continue;
  const bankPath = motionBankPath(candidate.motionId);
  if (!bankPath) {
    report.fixtureBuildFailures.push({ id, error: "unresolved motion bank" });
    continue;
  }
  const temporaryPath = path.join(options.bindingsDirectory, `${id}.candidate.json`);
  const build = runNode(
    "tools/animation/build_shenmue2_animation_fixture.mjs",
    [
      "--bindings-dir", options.bindingsDirectory,
      "--controller", candidate.controllerAddress,
      "--actor-code", candidate.actorCodes[0],
      "--motion-id", candidate.motionId,
      "--model", path.join(
        options.charactersDirectory,
        `${candidate.modelCodes[0]}.CHRM`,
      ),
      "--motion", bankPath,
      "--humans-idx", options.humansIndexPath,
      "--humans-afs", options.humansArchivePath,
      "--rest-profile", candidate.restProfile,
      "--curve-affine-policy", "any",
      "--status", "strict-native",
      "--id", id,
      "--out", temporaryPath,
    ],
    { quiet: true },
  );
  if (build.status !== 0) {
    report.fixtureBuildFailures.push({
      id,
      error: (build.stderr || build.stdout || "fixture builder failed").trim(),
    });
    continue;
  }
  const captured = runNode(
    "tools/animation/check_shenmue2_animation_conformance.mjs",
    [temporaryPath, "--strict", "--require-native"],
    { quiet: true },
  );
  const raw = runNode(
    "tools/animation/check_shenmue2_animation_conformance.mjs",
    [temporaryPath, "--strict", "--require-native", "--raw-motion"],
    { quiet: true },
  );
  if (captured.status === 0 && raw.status === 0) {
    fs.renameSync(temporaryPath, strictPath);
    report.strictFixturesAdded.push(path.relative(process.cwd(), strictPath));
  } else {
    const fixture = readJson(temporaryPath);
    fixture.status = "exact-native-discrepancy";
    fs.mkdirSync(discrepancyDirectory, { recursive: true });
    fs.writeFileSync(discrepancyPath, `${JSON.stringify(fixture, null, 2)}\n`);
    fs.unlinkSync(temporaryPath);
    report.discrepancyFixturesAdded.push({
      file: path.relative(process.cwd(), discrepancyPath),
      capturedPass: captured.status === 0,
      rawMotionPass: raw.status === 0,
      capturedReport: captured.stdout.trim(),
      capturedError: captured.stderr.trim(),
      rawMotionReport: raw.stdout.trim(),
      rawMotionError: raw.stderr.trim(),
    });
  }
}

// Strict fixtures are synchronized evidence snapshots, not hand-maintained
// golden files. Rebuild every one so a newly decoded native intermediate or a
// newly captured allocation cannot leave the passing corpus artificially
// stale. If expanded evidence no longer conforms, preserve it as an explicit
// discrepancy instead of retaining a narrower strict fixture.
for (const strictPath of jsonFiles(options.fixturesDirectory).sort()) {
  const previousFixture = readJson(strictPath);
  if (
    previousFixture.schema !== "new-yokosuka-s2-native-pose-fixture-v1"
    || previousFixture.status !== "strict-native"
  ) continue;
  if (!options.rebuildAll) {
    report.strictFixturesUnchanged.push(
      path.relative(process.cwd(), strictPath),
    );
    continue;
  }
  const rebuiltPath = path.join(
    options.bindingsDirectory,
    `${previousFixture.id}.strict-rebuild.json`,
  );
  const rebuild = runNode(
    "tools/animation/build_shenmue2_animation_fixture.mjs",
    [
      "--bindings-dir", options.bindingsDirectory,
      "--controller", previousFixture.provenance?.controllerAddress,
      "--actor-code", previousFixture.provenance?.modelBinding?.actorCode,
      "--motion-id", `0x${previousFixture.motionId.toString(16)}`,
      "--model", previousFixture.modelFile,
      "--motion", previousFixture.motionFile,
      "--humans-idx", options.humansIndexPath,
      "--humans-afs", options.humansArchivePath,
      "--rest-profile", previousFixture.provenance?.modelBinding?.restProfile,
      "--curve-affine-policy",
      previousFixture.provenance?.runtimeCurveAffines?.policy || "any",
      "--status", "strict-native",
      "--id", previousFixture.id,
      ...regressionThresholdArguments(previousFixture),
      "--out", rebuiltPath,
    ],
    { quiet: true },
  );
  if (rebuild.status !== 0) {
    report.fixtureBuildFailures.push({
      id: previousFixture.id,
      error: (
        rebuild.stderr || rebuild.stdout || "strict fixture rebuild failed"
      ).trim(),
    });
    continue;
  }
  const captured = runNode(
    "tools/animation/check_shenmue2_animation_conformance.mjs",
    [rebuiltPath, "--strict", "--require-native"],
    { quiet: true },
  );
  const raw = runNode(
    "tools/animation/check_shenmue2_animation_conformance.mjs",
    [rebuiltPath, "--strict", "--require-native", "--raw-motion"],
    { quiet: true },
  );
  if (captured.status === 0 && raw.status === 0) {
    fs.copyFileSync(rebuiltPath, strictPath);
    fs.unlinkSync(rebuiltPath);
    report.strictFixturesRebuilt.push(path.relative(process.cwd(), strictPath));
    continue;
  }
  const rebuiltFixture = readJson(rebuiltPath);
  rebuiltFixture.status = "exact-native-discrepancy";
  fs.mkdirSync(discrepancyDirectory, { recursive: true });
  const discrepancyPath = path.join(
    discrepancyDirectory,
    path.basename(strictPath),
  );
  fs.writeFileSync(
    discrepancyPath,
    `${JSON.stringify(rebuiltFixture, null, 2)}\n`,
  );
  fs.unlinkSync(rebuiltPath);
  fs.unlinkSync(strictPath);
  report.strictFixturesReclassified.push({
    file: path.relative(process.cwd(), discrepancyPath),
    capturedPass: captured.status === 0,
    rawMotionPass: raw.status === 0,
    capturedReport: captured.stdout.trim(),
    capturedError: captured.stderr.trim(),
    rawMotionReport: raw.stdout.trim(),
    rawMotionError: raw.stderr.trim(),
  });
}

if (fs.existsSync(discrepancyDirectory)) {
  for (const filename of fs.readdirSync(discrepancyDirectory).sort()) {
    if (!filename.endsWith("-native.json")) continue;
    const discrepancyPath = path.join(discrepancyDirectory, filename);
    const previousFixture = readJson(discrepancyPath);
    if (!options.rebuildAll) {
      report.discrepancyFixturesUnchanged.push(
        path.relative(process.cwd(), discrepancyPath),
      );
      continue;
    }
    const rebuiltPath = path.join(
      options.bindingsDirectory,
      `${previousFixture.id}.discrepancy-rebuild.json`,
    );
    // A discrepancy is a record of an unsolved browser/native mismatch, not
    // an immutable capture export. Rebuild it on every refresh so newly
    // decoded solver inputs and newly retained synchronized frames actually
    // reach conformance. Merely rechecking the old JSON left CC9's solved
    // current-actor head callback classified as a discrepancy indefinitely.
    const rebuild = runNode(
      "tools/animation/build_shenmue2_animation_fixture.mjs",
      [
        "--bindings-dir", options.bindingsDirectory,
        "--controller", previousFixture.provenance?.controllerAddress,
        "--actor-code", previousFixture.provenance?.modelBinding?.actorCode,
        "--motion-id", `0x${previousFixture.motionId.toString(16)}`,
        "--model", previousFixture.modelFile,
        "--motion", previousFixture.motionFile,
        "--humans-idx", options.humansIndexPath,
        "--humans-afs", options.humansArchivePath,
        "--rest-profile",
        previousFixture.provenance?.modelBinding?.restProfile,
        "--curve-affine-policy",
        previousFixture.provenance?.runtimeCurveAffines?.policy || "any",
        "--status", "exact-native-discrepancy",
        "--id", previousFixture.id,
        ...regressionThresholdArguments(previousFixture),
        "--out", rebuiltPath,
      ],
      { quiet: true },
    );
    if (rebuild.status !== 0) {
      report.fixtureBuildFailures.push({
        id: previousFixture.id,
        error: (
          rebuild.stderr || rebuild.stdout || "discrepancy rebuild failed"
        ).trim(),
      });
      continue;
    }
    // Fixtures and local research bindings may be placed on different
    // filesystems by an isolated refresh/test run, where rename(2) returns
    // EXDEV. Copy the completed JSON before removing the temporary instead.
    fs.copyFileSync(rebuiltPath, discrepancyPath);
    fs.unlinkSync(rebuiltPath);
    report.discrepancyFixturesRebuilt.push(
      path.relative(process.cwd(), discrepancyPath),
    );
    const captured = runNode(
      "tools/animation/check_shenmue2_animation_conformance.mjs",
      [discrepancyPath, "--strict", "--require-native"],
      { quiet: true },
    );
    const raw = runNode(
      "tools/animation/check_shenmue2_animation_conformance.mjs",
      [discrepancyPath, "--strict", "--require-native", "--raw-motion"],
      { quiet: true },
    );
    if (captured.status !== 0 || raw.status !== 0) continue;
    const fixture = readJson(discrepancyPath);
    fixture.status = "strict-native";
    const strictPath = path.join(options.fixturesDirectory, filename);
    fs.writeFileSync(strictPath, `${JSON.stringify(fixture, null, 2)}\n`);
    fs.unlinkSync(discrepancyPath);
    report.resolvedDiscrepanciesPromoted.push(
      path.relative(process.cwd(), strictPath),
    );
  }
}

if (
  report.strictFixturesAdded.length
  || report.strictFixturesReclassified.length
  || report.discrepancyFixturesAdded.length
  || report.resolvedDiscrepanciesPromoted.length
) {
  coverageResult = runNode(
    "tools/animation/build_shenmue2_animation_coverage.mjs",
    coverageArguments,
  );
  if (coverageResult.status !== 0) {
    throw new Error("Could not rebuild coverage after adding fixtures");
  }
  coverage = readJson(options.coveragePath);
}

report.finalCoverageSummary = coverage.summary;
const familyConformance = runNode(
  "tools/animation/build_shenmue2_animation_family_conformance.mjs",
  [
    "--coverage", options.coveragePath,
    "--out", options.familyConformancePath,
    "--strict",
  ],
  { quiet: true },
);
if (familyConformance.status !== 0) {
  report.familyConformanceFailure = (
    familyConformance.stderr
    || familyConformance.stdout
    || "family conformance failed"
  ).trim();
} else {
  report.familyConformance = readJson(options.familyConformancePath).summary;
}
fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stderr.write(
  `Corpus refresh: ${report.generatedBindingReports.length} binding reports, `
  + `${report.strictFixturesAdded.length} strict fixtures, `
  + `${report.strictFixturesRebuilt.length} rebuilt strict fixtures, `
  + `${report.strictFixturesReclassified.length} reclassified strict fixtures, `
  + `${report.discrepancyFixturesRebuilt.length} rebuilt discrepancies, `
  + `${report.resolvedDiscrepanciesPromoted.length} promoted discrepancies, `
  + `${report.discrepancyFixturesAdded.length} discrepancies, and `
  + `${report.fixtureBuildFailures.length} build failures.\n`,
);
if (
  report.bindingFailures.length
  || report.fixtureBuildFailures.length
  || report.familyConformanceFailure
) {
  process.exitCode = 1;
}
