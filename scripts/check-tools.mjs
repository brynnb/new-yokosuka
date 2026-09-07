import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [...new Set(execFileSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z',
], { cwd: root, encoding: 'utf8' }).split('\0'))]
  .filter(file => file && fs.existsSync(path.join(root, file)));
const errors = [];
const entryPoints = new Set([
  '__init__.py', 'runtime-assets.mjs', 'upload_to_r2.js', 'upload_dialogue_voice_pack.py',
]);
for (const file of files) {
  if (/^tools\/[^/]+\.(?:py|m?js|sh|lua)$/.test(file)
      && !entryPoints.has(path.basename(file))) {
    errors.push(`${file}: put new tools in their responsibility directory`);
  }
  if (!/\.(?:m?js|jsx|ts|tsx)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  // Inspect literal relative module imports without executing generators or
  // emulator controls. Dynamic asset URLs are not module dependencies.
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]+)\1/g)) {
    const target = path.resolve(root, path.dirname(file), match[2].split(/[?#]/)[0]);
    if (!fs.existsSync(target)) errors.push(`${file}: missing import ${match[2]}`);
  }
}

const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
for (const [name, command] of Object.entries(scripts)) {
  for (const match of command.matchAll(/\btools\/[\w./-]+\.(?:m?js|py|sh)\b/g)) {
    if (!fs.existsSync(path.join(root, match[0]))) errors.push(`npm ${name}: missing ${match[0]}`);
  }
  for (const match of command.matchAll(/\bpython(?:3(?:\.\d+)?)?\s+-m\s+(tools\.[\w.]+)/g)) {
    const target = match[1].replaceAll('.', '/') + '.py';
    if (!fs.existsSync(path.join(root, target))) errors.push(`npm ${name}: missing module ${match[1]}`);
  }
}

// Python's AST lets us validate package imports and syntax without importing
// tools that intentionally operate on a live emulator or extracted assets.
const pythonFiles = files.filter(file => /^(tools|tests)\/.*\.py$/.test(file));
const pythonCheck = String.raw`
import ast, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = json.load(sys.stdin)
tool_names = {pathlib.Path(p).stem for p in files if p.startswith('tools/')}
errors = []
for filename in files:
    try:
        tree = ast.parse((root / filename).read_text(encoding='utf-8'), filename)
    except (SyntaxError, UnicodeError) as error:
        errors.append(f'{filename}: {error}')
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            modules = [node.module] if node.module and node.level == 0 else []
        elif isinstance(node, ast.Import):
            modules = [alias.name for alias in node.names]
        else:
            continue
        for module in modules:
            if module.startswith('tools.'):
                target = root.joinpath(*module.split('.'))
                if not target.with_suffix('.py').is_file() and not target.is_dir():
                    errors.append(f'{filename}:{node.lineno}: missing module {module}')
            elif module.split('.')[0] in tool_names or module.startswith('lib.'):
                errors.append(f'{filename}:{node.lineno}: use an explicit tools package import for {module}')
print('\n'.join(errors))
sys.exit(bool(errors))
`;
try {
  execFileSync('python3', ['-c', pythonCheck, root], {
    input: JSON.stringify(pythonFiles), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch (error) {
  errors.push(String(error.stdout || error.stderr || error.message).trim());
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Tool layout, literal JS imports, ${pythonFiles.length} Python modules, and npm tool commands are valid.`);
