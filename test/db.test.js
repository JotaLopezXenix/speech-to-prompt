import { test } from 'node:test';
import assert from 'node:assert/strict';

// buildConfig() exige estas variables; damos valores dummy si no vienen del entorno.
process.env.SQL_SERVER ||= 'test.local';
process.env.SQL_DATABASE ||= 'testdb';

const { isTransient, buildConfig } = await import('../src/services/db.js');

test('isTransient reconoce el TimeoutError de tarn (cold-start del pool)', () => {
  // Esta es la firma exacta del incidente del 10-jul: el pool agota la espera de
  // adquisición mientras la Serverless reanuda. Antes escapaba (regex buscaba
  // "timeout", el mensaje dice "timed out") y withRetry no reintentaba.
  assert.equal(isTransient(new Error('operation timed out for an unknown reason')), true);
});

test('isTransient reconoce transitorios de Azure SQL por número y por código', () => {
  assert.equal(isTransient({ number: 40613 }), true);   // BD reanudando
  assert.equal(isTransient({ code: 'ESOCKET' }), true); // fallo de socket
  assert.equal(isTransient(new Error('Failed to connect to host:1433 in 15000ms')), true);
});

test('isTransient descarta errores no transitorios', () => {
  assert.equal(isTransient(new Error("Invalid column name 'x'")), false);
  assert.equal(isTransient({ number: 208 }), false); // tabla inexistente
});

test('buildConfig fija los timeouts del pool para absorber el cold-start', () => {
  const cfg = buildConfig();
  assert.equal(cfg.pool.acquireTimeoutMillis, 120000);
  assert.ok(cfg.pool.createTimeoutMillis >= 30000);
  assert.ok(cfg.pool.createRetryIntervalMillis > 0);
  // propagateCreateError:false es la palanca EFECTIVA: sin ella, mssql (que la
  // cablea a true) haría que tarn rechace el acquire al primer create fallido y
  // los timeouts de arriba no absorberían la reanudación (review 10-jul).
  assert.equal(cfg.pool.propagateCreateError, false);
});
