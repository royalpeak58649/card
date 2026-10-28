import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { playMatch } from '../tools/match.js';
import { writeTuned } from '../tools/tune.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AI_VALUES_PATH = path.join(HERE, '..', 'engine', 'aiValues.js');

test('playMatch: basic AI 는 결정적이고 시장 카드가 4종씩', () => {
  const opts = { seed: 1, characterIds: ['hayun', 'kangjin'], ai: ['basic', 'basic'] };
  const first = playMatch(opts);
  const second = playMatch(opts);
  assert.deepEqual(first, second);
  assert.ok(first.winner !== null || first.draw === true);
  assert.equal(first.marketIds.length, 2);
  for (const ids of first.marketIds) assert.ok(ids.length >= 4 && ids.length <= 6);
  for (const ids of first.factionIds) assert.ok(ids.length >= 1 && ids.length <= 4);
  assert.equal(first.deckIds.length, 2);
});

test('playMatch: smart AI 로 한 판이 끝난다', () => {
  const result = playMatch({ seed: 3, characterIds: ['hayun', 'jin'], ai: ['smart', 'smart'] });
  assert.equal(result.characterIds[0], 'hayun');
  assert.equal(result.characterIds[1], 'jin');
  assert.ok(result.turns >= 1);
  assert.ok(result.winner !== null || result.draw === true);
});

test('writeTuned: TUNED 블록만 다시 쓰고 나머지는 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tune-'));
  const target = path.join(dir, 'aiValues.js');
  fs.copyFileSync(AI_VALUES_PATH, target);

  writeTuned(target, { hayun: { silver: 2.345 } });
  const text = fs.readFileSync(target, 'utf8');

  assert.ok(text.includes('"silver": 2.35'));
  assert.ok(text.includes('// TUNED-START'));
  assert.ok(text.includes('// TUNED-END'));
  assert.ok(text.includes('export function defaultValue(cardId)'));
  assert.ok(text.includes('export function cardValue(characterId, cardId, overrides)'));
  assert.ok(text.indexOf('// TUNED-START') < text.indexOf('"silver": 2.35'));
  assert.ok(text.indexOf('"silver": 2.35') < text.indexOf('// TUNED-END'));

  fs.rmSync(dir, { recursive: true, force: true });
});
