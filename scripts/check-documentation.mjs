import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Include new, untracked documentation during a reorganization, but never ignored
// local archives, dependencies, or source-disc captures.
const files = [...new Set(execFileSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z',
], { cwd: root, encoding: 'utf8' }).split('\0'))]
  .filter(file => file.endsWith('.md') && fs.existsSync(path.join(root, file)));

function prose(text) {
  let fence = null;
  return text.split('\n').map(line => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function headings(text) {
  const ids = new Set();
  for (const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
    let id = base;
    for (let suffix = 1; ids.has(id); suffix++) id = `${base}-${suffix}`;
    ids.add(id);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

const documents = new Map(files.map(file => [file, prose(fs.readFileSync(path.join(root, file), 'utf8'))]));
const anchors = new Map([...documents].map(([file, text]) => [file, headings(text)]));
const errors = [];
let links = 0;
for (const [file, text] of documents) {
  // Inline Markdown links and reference definitions. External URLs and absolute
  // application routes are intentionally outside this local-document check.
  const expressions = [
    /!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+"[^"\n]*")?\)/g,
    /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm,
  ];
  for (const expression of expressions) for (const match of text.matchAll(expression)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    let decoded;
    try { decoded = decodeURIComponent(href); } catch {
      errors.push(`${file}:${line}: invalid URL encoding: ${href}`);
      continue;
    }
    const [target, fragment] = decoded.split('#');
    const resolved = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target.split('?')[0])) : file;
    links++;
    if (!fs.existsSync(path.join(root, resolved))) errors.push(`${file}:${line}: missing target ${href}`);
    else if (fragment && anchors.has(resolved) && !anchors.get(resolved).has(fragment)) {
      errors.push(`${file}:${line}: missing heading ${href}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${files.length} Markdown documents and ${links} local links/anchors.`);
