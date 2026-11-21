const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'tmp', 'pdfs'), { recursive: true });
const tests = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((file) => file.endsWith('.cjs'))
  .sort();
let failures = 0;
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(root, 'tests', test)], {
    cwd: root,
    encoding: 'utf8',
  });
  console.log((result.status === 0 ? 'PASS ' : 'FAIL ') + test);
  if (result.status !== 0) {
    failures++;
    console.error(result.stdout || '', result.stderr || '', result.error || '');
  }
}
console.log(tests.length - failures + '/' + tests.length + ' test files passed.');
process.exitCode = failures ? 1 : 0;
