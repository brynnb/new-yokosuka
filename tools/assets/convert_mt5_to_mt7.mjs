#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { convertMt5ToMt7 } from './mt5_to_mt7.js';

const usage = 'Usage: node tools/assets/convert_mt5_to_mt7.mjs INPUT.MT5 OUTPUT.MT7 --template RETAIL.MT7\nExperimental static Dreamcast converter; writes OUTPUT.MT7.json with validation and limitations. Never overwrites files.';
try {
  const { values, positionals } = parseArgs({ options: { template: { type: 'string' }, help: { type: 'boolean' } }, allowPositionals: true });
  if (values.help) console.log(usage);
  else {
    if (positionals.length !== 2 || !values.template) throw new Error(usage);
    const [input, output] = positionals.map(p => path.resolve(p));
    const template = path.resolve(values.template);
    const reportPath = `${output}.json`;
    if ([output, reportPath].some(p => fs.existsSync(p) || p === input || p === template)) throw new Error('Output or report already exists or would overwrite an input');
    const result = convertMt5ToMt7(fs.readFileSync(input), fs.readFileSync(template));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result.bytes, { flag: 'wx' });
    fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, { flag: 'wx' });
    console.log(`Wrote ${output}: ${result.report.nodes} nodes, ${result.report.meshes.reduce((n, m) => n + m.triangles, 0)} triangles.\nReport: ${reportPath}\nEXPERIMENTAL: materials use the template; original-game compatibility is unverified.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
