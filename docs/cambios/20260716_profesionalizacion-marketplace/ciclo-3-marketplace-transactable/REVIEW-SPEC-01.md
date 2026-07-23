# REVIEW — SPEC-01 (modelo de acceso + gate) · revisión adversarial independiente

**Fecha:** 22-jul-2026 · **Fase JCC:** 4 (revisión) · **Método:** revisión **independiente** por subagente con contexto fresco (no escribió el código), postura adversarial (refutar, no aprobar). Hallazgos accionables re-verificados por el orquestador.
**Contrato revisado:** `SPEC-01_modelo-acceso-gate.md`. **Commit:** `3e45802`.

## Resultado de la verificación
- `npm test` → **16/16** (ejecutado por el revisor). Incluye los 6 de `test/entitlement.test.js`; `test/allowlist.test.js` ya no existe. `npm run migrate` **no** se ejecutó en la review (no tocar BD); su aplicación+idempotencia se verificó en la fase de implementación.

## Regresión (SPEC §5 "Qué se PRESERVA") — VERDE
- `src/services/token-verify.js`: **intacto** (no está en el diff del commit). Frontera de seguridad sin tocar.
- Contrato `req.user` (mismos campos) **idéntico** en ambas ramas (dev y autenticada).
- `ensureUser` por `external_id` (+ `email` por COALESCE) y aislamiento por `owner_id`: **intactos**.
- **Bypass de dev local** sigue entrando **sin gate**.
- Montaje de rutas en `server.js`: **sin cambios**.
- Migración 007 solo **añade** tabla/índices y **relaja** `users.email` a NULL → no hay pérdida ni corrupción de datos; idempotente.
- `allowlist.js` + su test **eliminados**; **sin referencias colgantes en código** (`NOT_ALLOWLISTED`/`allowlist` solo quedan en docs y en el contrato OpenAPI — ver F-2).

## Cumplimiento del SPEC — COMPLETO
Tabla + columnas + 3 índices filtrados + fix H6 (007); las 4 funciones + helper puro (`entitlement-store.js`); gate `bind → hasActiveAccess → 403 NO_ACCESS` (`identity.js`); retirada de la lista blanca; seed de cutover idempotente; tests. El commit toca **solo** los 8 ficheros esperados. **Fuera de alcance: limpio** (nada de landing/webhook/fulfillment/retención/UI).

## Hallazgos

| # | Gravedad | Tipo | Fichero | Resumen |
|---|---|---|---|---|
| F-1 | **MEDIA** | hueco del SPEC (diseño) | `src/middleware/identity.js:54-60` | El nuevo orden aprovisiona en `users` a **cualquier** cuenta Microsoft autenticada aunque reciba 403 sin acceso. |
| F-2 | **BAJA** | incumplimiento (drift de contrato) | `openapi/speech-to-prompt.yaml:524` · `web/src/api/schema.d.ts:487` | El contrato OpenAPI aún describe el 403 como `NOT_ALLOWLISTED`; el código devuelve `NO_ACCESS`. |
| F-3 | BAJA | eficiencia (SPEC-mandada) | `entitlement-store.js:31-42` / `identity.js:57` | `bindPendingEntitlements` (UPDATE) corre en **cada** request autenticado (no solo el 1er login). |
| F-4 | BAJA | observación (SPEC-compliant) | `scripts/sql/seed-entitlements-cutover.sql` | El seed solo cubre usuarios **ya existentes**; si Jesús/Agustín no estuvieran en `users`, no sembraría nada. |
| F-5 | BAJA | informativo | `entitlement-store.js` | `isEntitlementActive` (puro) solo lo usan los tests; el gate real compara en BD con `SYSUTCDATETIME()` (correcto). |

### Detalle F-1 (MEDIA) — provisión de no-suscriptores
Antes (ciclo 1): `verifyToken → isAllowed(email) → 403 ANTES de ensureUser` (un no-autorizado **no** se aprovisionaba). Ahora: `verifyToken → ensureUser (JIT) → bind → hasActiveAccess → 403`. El orden es **obligado y correcto** (el gate y el bind necesitan el `id` interno; el SPEC §4.3 lo prescribe así → **cumple el SPEC**). Pero es un **cambio de comportamiento** que el §5 no reconoce: con la oferta pública del Marketplace, cualquiera que se loguee/consienta queda insertado en `dbo.users` aunque no tenga acceso → crecimiento no acotado de la tabla. **Solo se materializa cuando la oferta sea pública** (SPEC-03+/ciclo 7); hoy no hay flujo que traiga a esos usuarios. → **decisión de mesa común**: aceptar y limpiar periódicamente, o resolver acceso por `oid`/email antes del JIT. No bloquea.

### Detalle F-2 (BAJA) — drift de contrato (re-verificado por el orquestador)
Confirmado por grep: `openapi/speech-to-prompt.yaml:524` y el generado `web/src/api/schema.d.ts:487` dicen `NOT_ALLOWLISTED`; `identity.js:59` devuelve `NO_ACCESS`. **Sin impacto en runtime:** el `code` es string libre (no enum) y el front (`web/src/api/client.ts`) solo trata especial el **401**; el 403 se maneja por `message`, no por la cadena. Es doc/contrato desactualizado (el SPEC no listó el YAML en MODIFIED). **Fix limpio:** editar el `yaml` (fuente de verdad) → `NO_ACCESS` + `npm run gen:api` para regenerar `schema.d.ts`.

## Intentos de refutación fallidos (verificados OK)
Índices filtrados + DML (ARITHABORT/1934 no aplica en Azure SQL con tedious), lotes `GO`/`splitBatches` (5 lotes correctos; DDL transaccional seguro), H6 completo (nada más asume email obligatorio), normalización de email coherente (`trim().toLowerCase()` ↔ `LOWER()`), fail-closed (throw de BD → catch → 500, nunca `next()`), y concesión manual visible en el mismo request (bind autocommit antes del SELECT).

## VEREDICTO: **SÍ** — cumple el SPEC y NO rompe la superficie de regresión.
Traducción fiel y completa de SPEC-01; `npm test` 16/16; sin trabajo fuera de alcance; regresión intacta; H6 resuelto; allowlist retirada sin referencias colgantes.

**Dos salvedades para la mesa común (ninguna bloquea el despliegue):**
1. **F-1 (MEDIA, diseño):** provisión de no-suscriptores en `users` con oferta pública → decidir mitigación (no urge; se materializa en ciclo 7).
2. **F-2 (BAJA, drift):** regenerar el OpenAPI (`NOT_ALLOWLISTED` → `NO_ACCESS`).

*(F-3/F-4/F-5: aceptadas — mandadas por el SPEC o sin impacto.)*

---

## Cierre del bucle 3↔4 (22-jul-2026)

- **F-2 (BAJA, drift OpenAPI): CORREGIDO.** `openapi/speech-to-prompt.yaml` (respuesta `Forbidden`) → `NO_ACCESS`; `web/src/api/schema.d.ts` **regenerado** (`npm run gen:api`) — ya no contiene `NOT_ALLOWLISTED`. Re-verificado: `npm test` sigue **16/16**.
- **F-1 (MEDIA, diseño): ACEPTADO y anotado** como [ADDENDUM 2026-07-22 en el DESIGN](DESIGN.md#addendum-2026-07-22--provisión-de-no-suscriptores-en-users-de-la-review-de-spec-01-f-1) — mitigación a decidir al abrir la oferta pública (no urge, no bloquea).
- **F-3/F-4/F-5:** sin cambios (aceptadas).

**Estado tras el bucle:** veredicto **SÍ** con F-2 resuelto y F-1 registrado para mesa común. SPEC-01 **listo para desplegar** (recordatorio: `migrate` + `seed-entitlements-cutover.sql` **antes** de desplegar; retirar `ALLOWED_EMAILS` después).
