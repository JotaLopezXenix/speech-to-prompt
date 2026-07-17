import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAllowlist, isAllowed } from '../src/utils/allowlist.js';

test('parseAllowlist normaliza (trim, lowercase, descarta vacíos)', () => {
  const s = parseAllowlist(' A@x.com, b@Y.com ,, c@z.com ');
  assert.deepEqual([...s].sort(), ['a@x.com', 'b@y.com', 'c@z.com']);
});

test('parseAllowlist con undefined/vacío → set vacío', () => {
  assert.equal(parseAllowlist(undefined).size, 0);
  assert.equal(parseAllowlist('').size, 0);
  assert.equal(parseAllowlist('  ,  ,').size, 0);
});

test('isAllowed es fail-closed: email null o lista vacía → false', () => {
  assert.equal(isAllowed(null, parseAllowlist('a@x.com')), false);
  assert.equal(isAllowed('', parseAllowlist('a@x.com')), false);
  assert.equal(isAllowed('a@x.com', new Set()), false);
});

test('isAllowed compara case-insensitive; distingue match de no-match', () => {
  const s = parseAllowlist('a@x.com, b@y.com');
  assert.equal(isAllowed('A@X.com', s), true);
  assert.equal(isAllowed(' b@y.com ', s), true);
  assert.equal(isAllowed('c@z.com', s), false);
});
