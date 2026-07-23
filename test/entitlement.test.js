import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEntitlementActive } from '../src/services/entitlement-store.js';

const AHORA = new Date('2026-07-22T12:00:00Z');

test('activo sin caducidad → true', () => {
  assert.equal(isEntitlementActive({ status: 'active', access_expires_at: null }, AHORA), true);
});

test('activo con caducidad futura → true', () => {
  const futuro = new Date('2026-12-31T00:00:00Z');
  assert.equal(isEntitlementActive({ status: 'active', access_expires_at: futuro }, AHORA), true);
});

test('activo con caducidad pasada → false', () => {
  const pasado = new Date('2026-01-01T00:00:00Z');
  assert.equal(isEntitlementActive({ status: 'active', access_expires_at: pasado }, AHORA), false);
});

test('estados no-activos (suspended/canceled/pending) → false', () => {
  assert.equal(isEntitlementActive({ status: 'suspended', access_expires_at: null }, AHORA), false);
  assert.equal(isEntitlementActive({ status: 'canceled', access_expires_at: null }, AHORA), false);
  assert.equal(isEntitlementActive({ status: 'pending', access_expires_at: null }, AHORA), false);
});

test('fila nula o sin status → false (fail-closed)', () => {
  assert.equal(isEntitlementActive(null, AHORA), false);
  assert.equal(isEntitlementActive({}, AHORA), false);
});

test('acepta caducidad como string ISO (como la devuelve mssql)', () => {
  assert.equal(isEntitlementActive({ status: 'active', access_expires_at: '2026-12-31T00:00:00Z' }, AHORA), true);
  assert.equal(isEntitlementActive({ status: 'active', access_expires_at: '2026-01-01T00:00:00Z' }, AHORA), false);
});
