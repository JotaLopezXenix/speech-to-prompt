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
| 2 — `frontend-mobile-first` | `ciclo-2-frontend-mobile-first/` | **CERRADO — en producción** (22-jul). Frontend nuevo (React+Vite+TS+Tailwind+shadcn, mobile-first, **PWA instalable**) sirviéndose en la **raíz `/`**; **7/7 SPEC cerrados** (01 cimiento · 02 api-tipada `/api/v1` · 03 auth-login MSAL · 04 captura-salvaguardas R1 · 05 resto-flujo · 06 marco · 07 cutover `/app→/`), todos con review adversarial limpia + **smoke logueado del usuario** (login en `/`, flujo completo, **PWA instalada en móvil**). |
| 3 — `marketplace-transactable` | `ciclo-3-marketplace-transactable/` | Diseño CERRADO. **`SPEC-01` (modelo de acceso + gate): implementado + review SÍ** (commit `3e45802`; local, sin desplegar). Pendiente: deploy de SPEC-01 (migrar+seed ANTES) + specs 02–06. Burocracia Partner Center **mapeada** (cuenta ✅, payout ✅, fiscal a falta de 1 acción — ver runbook). |
| 4 — `destilado-destino` | *(pendiente)* | selección modelo destino + ajustes de formato (funcionalidad estrella) |
| 5 — `uso-y-costes` | *(pendiente)* | fair-use + costes visibles |
| 6 — `backoffice-minimo` | *(pendiente)* | métricas + suscripciones + consumo |
| 7 — `publicacion` | *(pendiente)* | ficha + certificación + compra de prueba |

*(Decisión 22-jul: la burocracia de Partner Center se lleva como **track/runbook propio** dentro de `ciclo-3-marketplace-transactable/` (`RUNBOOK-partner-center.md`), en paralelo al DESIGN del código del ciclo 3.)*

## Documentos por ciclo (existentes)

- **Ciclo 1** `ciclo-1-identidad-entra/`: `DESIGN.md` (con ADDENDUM de review), `SPEC.md`, `RUNBOOK-entra-y-cutover.md`.
- **Ciclo 2** `ciclo-2-frontend-mobile-first/`:
  - Encuadre: `DESIGN.md`.
  - **2a diseño:** `DESIGN-2a.md`, `BRIEF-claude-design-2a.md`, `DESIGN-SYSTEM-2a.md`, `diseno-claude-design/` (snapshots de Claude Design).
  - **2b construcción:** `SPEC-01_cimiento.md` (con ADDENDUM del stack), `SPEC-02_api-tipada.md` (con ADDENDUM npx), `SPEC-03_auth-login.md`, `SPEC-04_captura-salvaguardas.md` (cerrado, en prod), `SPEC-05_resto-flujo.md` (+ ADDENDUM de implementación 22-jul; Revisión/Destilado/Resultado) con su `REVIEW-SPEC-05.md` (revisión adversarial independiente 22-jul: **veredicto SÍ**, 0 ALTA/0 MEDIA/2 BAJA cosméticos ya corregidos; verif. build/lint/14-14 verde; **smoke logueado del usuario verificado 22-jul → CERRADO**), `SPEC-06_marco.md` (especificado + implementado 22-jul; Historial/Ajustes) con su `REVIEW-SPEC-06.md` (revisión adversarial 22-jul: **veredicto SÍ**, 0 ALTA/0 MEDIA/5 BAJA; B-1/B-5 corregidos, resto aceptados; build/lint/14-14 verde; **smoke logueado verificado 22-jul → CERRADO**), `SPEC-07_cutover.md` (cutover `/app→/` especificado + implementado 22-jul: `vite base`+PWA a `/`, `web/dist` servido en `/` + redirect transitorio, `public/` retirado) con su `REVIEW-SPEC-07.md` (revisión adversarial 22-jul: **veredicto SÍ**, 1 MEDIA corregida + 2 BAJA aceptadas); **desplegado + smoke logueado en `/` verificado 22-jul (incl. PWA instalada en móvil) → CERRADO; cierra el ciclo 2**.
  - Código en `web/` (cimiento + `src/api/` cliente tipado + `src/auth/` MSAL), contrato en `openapi/speech-to-prompt.yaml`, alias `/api/v1` en `server.js`.
  - **Fuentes para el futuro SPEC-04 (captura+salvaguardas):** además del `DESIGN.md` del ciclo (§4.4 cosechar, §5 salvaguardas, §6 R1) y el `DESIGN.md` del programa (§6 "Qué se PRESERVA"), el material real vive en **el código a portar** (`public/js/{audio-recorder,audio-guards,diagnostics,phase1-capture}.js`) y en **los dos cambios previos que construyeron esas salvaguardas con DESIGN/SPEC/REVIEW completos**: `docs/cambios/20260628_grabacion-stop-espontaneo/` y `docs/cambios/20260710_robustez-coldstart-sql/`.

- **Ciclo 3** `ciclo-3-marketplace-transactable/` (arrancado 22-jul; **DESIGN cerrado**, siguiente `/jcc-spec`; track burocrático en curso):
  - `DESIGN.md` — **DESIGN del ciclo** (JCC Fase 1, cerrado 22-jul): objetivo, usuarios, alcance/fuera de alcance, **decisiones estructurales** (reconciliación identidad-comprador "misma cuenta" · entitlement unificado marketplace+manual · gate que retira `ALLOWED_EMAILS` · fulfillment secretless por credencial federada · retención v1-A) + flujos, superficie de regresión, riesgos y **troceo sugerido en 6 specs**.
  - `SPEC-01_modelo-acceso-gate.md` — **spec fundacional** (Fase 2): tabla `entitlements` (migración 007) + servicio `entitlement-store.js` + gate por "acceso activo" que **retira `ALLOWED_EMAILS`** (cutover que migra a Jesús+Agustín a concesiones manuales) + fix H6 (`users.email`→NULL). **IMPLEMENTADO** (commit `3e45802`; `npm test` 16/16, migración 007 aplicada+idempotente, sanity del store contra SQL real). *(SPEC-02…06 pendientes; 02 fulfillment secretless y 06 Preview se afinan tras la reunión.)*
  - `REVIEW-SPEC-01.md` — **revisión adversarial independiente** (Fase 4, subagente): **veredicto SÍ** (cumple SPEC, no rompe regresión; `npm test` 16/16). 0 ALTA · 1 MEDIA (F-1: provisión de no-suscriptores en `users` con oferta pública → mesa común, no urge) · 1 BAJA accionable (F-2: drift OpenAPI `NOT_ALLOWLISTED`→`NO_ACCESS`) · 3 BAJA aceptadas.
  - `RUNBOOK-partner-center.md` — **track burocrático** del alta como oferta SaaS transactable en Microsoft Marketplace (Partner Center): checklist maestro, estado, bloqueos y bitácora. Regla: los formularios fiscales/bancarios los rellena el usuario.
  - `BRIEF-reunion-isv-success-2026-07-23.md` (+ `Brief-Speech-to-prompt-ISV-Success.docx`, versión Word para compartir) — brief para la reunión de Microsoft **ISV Success** (*Discovery & Planning*, 23-jul): pitch, estado mapeado a su agenda, preguntas y materiales.
  - `ARQUITECTURA.md` — diagramas Mermaid (arquitectura actual 100% Azure/secretless + integración Marketplace del ciclo 3); versión presentable publicada como artefacto.

## Handoffs (bitácoras de sesión)

- `handoffs/HANDOFF-2026-07-18.md` — cierre del ciclo 1 (cutover a prod verificado) + arranque del ciclo 2.
- `handoffs/HANDOFF-2026-07-20.md` — ciclo 2: 2a diseño completo (Claude Design) + SPEC-01 `cimiento` de 2b cerrado (desplegado, R5 verificado en Azure).
- `handoffs/HANDOFF-2026-07-21.md` — ciclo 2b: **SPEC-02 `api-tipada` y SPEC-03 `auth-login` CERRADOS** (ambos desplegados y verificados en Azure; SPEC-03 con login real e2e).
- `handoffs/HANDOFF-2026-07-21-spec04.md` — ciclo 2b: **SPEC-04 `captura-salvaguardas` (R1) CERRADO** (implementado → review 3↔4 con 2 MEDIA+2 BAJA corregidas → desplegado → smoke logueado del usuario, incl. móvil) + **refactor de documentación JCC v1.2** (recorte de "Fase actual" + creación del índice global `docs/cambios/README.md`). Siguiente: SPEC-05.
- `handoffs/HANDOFF-2026-07-22.md` — **cierre del ciclo 2 `frontend-mobile-first`**: SPEC-05 `resto-flujo`, SPEC-06 `marco` y SPEC-07 `cutover /app→/` **CERRADOS** (cada uno spec→impl→review 3↔4→deploy→smoke logueado del usuario). El frontend nuevo (mobile-first + **PWA**) se sirve en la **raíz `/`**, `public/` retirado; **7/7 SPEC cerrados**. Siguiente: ciclo 3 `marketplace-transactable` (`/jcc-design`).
- `handoffs/HANDOFF-2026-07-22-ciclo3-arranque.md` — **arranque del ciclo 3 `marketplace-transactable`** (sesión de diseño, sin código): investigación del Microsoft Marketplace, **mapeo del Partner Center** (cuenta+payout ✅, tax del Seller *Action required*; oferta `speechtoprompt` en Draft), creación del **runbook burocrático** + **brief y arquitectura** para la reunión Microsoft ISV Success (23-jul). **JCC Fase 1 EN CURSO/PAUSADA** hasta la reunión (aún sin `DESIGN.md`). Docs sin commitear al cerrar.
