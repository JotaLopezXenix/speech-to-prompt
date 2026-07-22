# Programa `profesionalizacion-marketplace` — índice

Carpeta del **programa multi-ciclo** que profesionaliza la app para publicarla en Azure Marketplace. A diferencia de un cambio normal (una sola carpeta con DESIGN/SPEC/REVIEW), esto es un **programa**: cada ciclo tiene su propia subcarpeta con su DESIGN/SPEC/etc.

> **Estado vivo:** la fuente de verdad del estado actual es la línea **"Fase actual"** de `CLAUDE.md` (raíz del repo). Este README es el **mapa** de la carpeta; los `handoffs/` son **fotos fechadas** de cada sesión.

> ⚠️ **Dos ejes de numeración distintos (no confundir):**
> - **"Ciclo N"** = uno de los 7 ciclos del **programa** (tabla de abajo; p. ej. *ciclo 4 = `destilado-destino`*, funcionalidad estrella). Se describen en el `DESIGN.md` del programa (§3).
> - **"SPEC-NN"** = troceo interno **del ciclo 2** (`frontend-mobile-first`) en 6 specs (01 cimiento · 02 API tipada · 03 auth/login · 04 captura+salvaguardas · 05 resto flujo · 06 marco). Viven en `ciclo-2-frontend-mobile-first/`.
> Por tanto **"SPEC-04" (captura+salvaguardas del ciclo 2) NO es "ciclo 4" (destilado-destino del programa)**. Cada uno se apoya en documentación distinta.

## Convención de layout

- **Nivel programa (esta carpeta):** documentos transversales a todos los ciclos.
  - `DESIGN.md` — DESIGN del **programa** (objetivo, troceo en 7 ciclos, decisiones estructurales, riesgos). Base de todo.
  - `BRIEF-marketplace-agustin.md` / `.docx` — material de negocio (ciclo 0): niveles de oferta y requisitos del Marketplace.
  - `INVESTIGACION-modelo-destino-prompt-guides.md` — investigación (ciclo 0) de prompt-guides por modelo destino; **alimenta el ciclo 4** (`destilado-destino`).
  - `handoffs/` — **bitácoras de cierre de sesión** (snapshots fechados con evidencia; pueden abarcar varios ciclos).
- **Nivel ciclo (`ciclo-N-<slug>/`):** artefactos JCC de ese ciclo (DESIGN, SPEC, RUNBOOK, y la REVIEW como ADDENDUM dentro del DESIGN).

## Índice de ciclos y estado

| Ciclo | Carpeta | Estado |
|---|---|---|
| 0 — preparación | *(en raíz: BRIEF + INVESTIGACION)* | investigación ✅ (Gemini/optimizadores = top-up en ciclo 4); burocracia Partner Center pendiente (Agustín) |
| 1 — `identidad-entra` | `ciclo-1-identidad-entra/` | **CERRADO** — en prod, login e2e verificado |
| 2 — `frontend-mobile-first` | `ciclo-2-frontend-mobile-first/` | **2a diseño COMPLETO** (dirección "B · Papel") · **2b en construcción — 4/6 SPEC CERRADOS:** 01 `cimiento` ✅, 02 `api-tipada` ✅, 03 `auth-login` ✅, **04 `captura-salvaguardas` ✅** (R1, el hueso; en prod, smoke logueado incl. móvil) · **05 `resto-flujo` DESPLEGADO** (en `main`; review limpia; deploy OK verificado por curl; pendiente smoke logueado para CERRAR) · **06 `marco` ESPECIFICADO** (Historial/Ajustes; sin implementar; cutover `/app→/` = SPEC-07/RUNBOOK aparte) → siguiente: **`/jcc-implement` del SPEC-06** |
| 3 — `marketplace-transactable` | *(pendiente)* | landing + webhook + Fulfillment APIs + suscripciones + gating |
| 4 — `destilado-destino` | *(pendiente)* | selección modelo destino + ajustes de formato (funcionalidad estrella) |
| 5 — `uso-y-costes` | *(pendiente)* | fair-use + costes visibles |
| 6 — `backoffice-minimo` | *(pendiente)* | métricas + suscripciones + consumo |
| 7 — `publicacion` | *(pendiente)* | ficha + certificación + compra de prueba |

*(Refinamiento pendiente del troceo: la configuración de Marketplace/Partner Center quizá merezca un ciclo/track propio explícito; decidir al llegar al ciclo 3.)*

## Documentos por ciclo (existentes)

- **Ciclo 1** `ciclo-1-identidad-entra/`: `DESIGN.md` (con ADDENDUM de review), `SPEC.md`, `RUNBOOK-entra-y-cutover.md`.
- **Ciclo 2** `ciclo-2-frontend-mobile-first/`:
  - Encuadre: `DESIGN.md`.
  - **2a diseño:** `DESIGN-2a.md`, `BRIEF-claude-design-2a.md`, `DESIGN-SYSTEM-2a.md`, `diseno-claude-design/` (snapshots de Claude Design).
  - **2b construcción:** `SPEC-01_cimiento.md` (con ADDENDUM del stack), `SPEC-02_api-tipada.md` (con ADDENDUM npx), `SPEC-03_auth-login.md`, `SPEC-04_captura-salvaguardas.md` (cerrado, en prod), `SPEC-05_resto-flujo.md` (+ ADDENDUM de implementación 22-jul; Revisión/Destilado/Resultado) con su `REVIEW-SPEC-05.md` (revisión adversarial independiente 22-jul: **veredicto SÍ**, 0 ALTA/0 MEDIA/2 BAJA cosméticos ya corregidos; verif. build/lint/14-14 verde; pendiente smoke Azure), `SPEC-06_marco.md` (especificado 22-jul; Historial/Ajustes; sin implementar). **Cutover `/app→/` = SPEC-07/RUNBOOK pendiente** (encuadrado en `SPEC-06 §7`).
  - Código en `web/` (cimiento + `src/api/` cliente tipado + `src/auth/` MSAL), contrato en `openapi/speech-to-prompt.yaml`, alias `/api/v1` en `server.js`.
  - **Fuentes para el futuro SPEC-04 (captura+salvaguardas):** además del `DESIGN.md` del ciclo (§4.4 cosechar, §5 salvaguardas, §6 R1) y el `DESIGN.md` del programa (§6 "Qué se PRESERVA"), el material real vive en **el código a portar** (`public/js/{audio-recorder,audio-guards,diagnostics,phase1-capture}.js`) y en **los dos cambios previos que construyeron esas salvaguardas con DESIGN/SPEC/REVIEW completos**: `docs/cambios/20260628_grabacion-stop-espontaneo/` y `docs/cambios/20260710_robustez-coldstart-sql/`.

## Handoffs (bitácoras de sesión)

- `handoffs/HANDOFF-2026-07-18.md` — cierre del ciclo 1 (cutover a prod verificado) + arranque del ciclo 2.
- `handoffs/HANDOFF-2026-07-20.md` — ciclo 2: 2a diseño completo (Claude Design) + SPEC-01 `cimiento` de 2b cerrado (desplegado, R5 verificado en Azure).
- `handoffs/HANDOFF-2026-07-21.md` — ciclo 2b: **SPEC-02 `api-tipada` y SPEC-03 `auth-login` CERRADOS** (ambos desplegados y verificados en Azure; SPEC-03 con login real e2e).
- `handoffs/HANDOFF-2026-07-21-spec04.md` — ciclo 2b: **SPEC-04 `captura-salvaguardas` (R1) CERRADO** (implementado → review 3↔4 con 2 MEDIA+2 BAJA corregidas → desplegado → smoke logueado del usuario, incl. móvil) + **refactor de documentación JCC v1.2** (recorte de "Fase actual" + creación del índice global `docs/cambios/README.md`). Siguiente: SPEC-05.
