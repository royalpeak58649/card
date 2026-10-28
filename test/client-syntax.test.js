import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const clientDir = fileURLToPath(new URL('../client/', import.meta.url));

const jsFiles = readdirSync(clientDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

test('client: .js 파일이 있다', () => {
  assert.ok(jsFiles.length > 0, 'client 폴더에 .js 파일이 없습니다');
});

for (const name of jsFiles) {
  test(`client/${name}: node --check 문법 검사`, () => {
    const file = path.join(clientDir, name);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  });
}
