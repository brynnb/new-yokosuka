#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  conformanceFailures,
  formatShenmue2ConformanceReport,
  runShenmue2AnimationConformance,
} from "../lib/Shenmue2AnimationConformance.js";

const arguments_ = process.argv.slice(2);
const json = arguments_.includes("--json");
const strict = arguments_.includes("--strict");
const requireNative = arguments_.includes("--require-native");
const rawMotion = arguments_.includes("--raw-motion");
const includeDiscrepancies = arguments_.includes("--include-discrepancies");
const onlyDiscrepancies = arguments_.includes("--only-discrepancies");
const paths = arguments_.filter((argument) => !argument.startsWith("--"));
const defaultFixtureDirectory = "tests/fixtures/shenmue2-animation";
const discoverFixtures = (directory) => fs.readdirSync(
  directory,
  { withFileTypes: true },
).flatMap((entry) => {
  const filename = path.join(directory, entry.name);
  if (entry.isDirectory()) {
    return includeDiscrepancies || onlyDiscrepancies
      ? discoverFixtures(filename)
      : [];
  }
  return entry.name.endsWith("-native.json") ? [filename] : [];
});
const fixturePaths = (paths.length ? paths : discoverFixtures(
  defaultFixtureDirectory,
)).filter((fixturePath) => {
  if (!onlyDiscrepancies) return true;
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return fixture.status?.endsWith("discrepancy");
}).sort();
const reports = fixturePaths.map((fixturePath) => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return runShenmue2AnimationConformance(fixture, {
    repositoryRoot: process.cwd(),
    useCapturedEvaluatedCurveValues: !rawMotion,
  });
});

if (json) {
  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
} else {
  process.stdout.write(`${reports.map(formatShenmue2ConformanceReport).join("\n\n")}\n`);
}

if (
  strict
  && reports.some((report) => conformanceFailures(
    report,
    report.regressionThresholds,
  ).length)
) {
  process.exitCode = 1;
}
if (
  requireNative
  && reports.some((report) => conformanceFailures(report).length)
) {
  process.exitCode = 1;
}
