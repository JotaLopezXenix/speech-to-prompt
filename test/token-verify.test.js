import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildExternalId, extractEmail, assertIssuer } from '../src/services/token-verify.js';

test('buildExternalId concatena tid.oid (clave canónica multi-tenant)', () => {
  assert.equal(buildExternalId('tenantA', 'oid123'), 'tenantA.oid123');
});

test('extractEmail respeta la precedencia preferred_username > email > upn', () => {
  assert.equal(extractEmail({ preferred_username: 'a@x', email: 'b@x', upn: 'c@x' }), 'a@x');
  assert.equal(extractEmail({ email: 'b@x', upn: 'c@x' }), 'b@x');
  assert.equal(extractEmail({ upn: 'c@x' }), 'c@x');
  assert.equal(extractEmail({}), null);
});

test('assertIssuer acepta el issuer coherente con el tid del token', () => {
  assert.doesNotThrow(() =>
    assertIssuer({ tid: 'T', iss: 'https://login.microsoftonline.com/T/v2.0' }),
  );
});

test('assertIssuer rechaza un issuer de otro tenant o malformado', () => {
  assert.throws(() =>
    assertIssuer({ tid: 'T', iss: 'https://login.microsoftonline.com/OTHER/v2.0' }),
  );
  assert.throws(() => assertIssuer({ tid: 'T', iss: 'https://evil.example/T/v2.0' }));
});
