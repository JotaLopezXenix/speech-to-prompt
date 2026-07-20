# Programa `profesionalizacion-marketplace` — índice

Carpeta del **programa multi-ciclo** que profesionaliza la app para publicarla en Azure Marketplace. A diferencia de un cambio normal (una sola carpeta con DESIGN/SPEC/REVIEW), esto es un **programa**: cada ciclo tiene su propia subcarpeta con su DESIGN/SPEC/etc.

> **Estado vivo:** la fuente de verdad del estado actual es la línea **"Fase actual"** de `CLAUDE.md` (raíz del repo). Este README es el **mapa** de la carpeta; los `handoffs/` son **fotos fechadas** de cada sesión.

## Convención de layout

- **Nivel programa (esta carpeta):** documentos transversales a todos los ciclos.
  - `DESIGN.md` — DESIGN del **programa** (objetivo, troceo en ciclos, decisiones estructurales, riesgos). Base de todo.
  - `BRIEF-marketplace-agustin.md` / `.docx` — material de negocio (ciclo 0): niveles de oferta y requisitos del Marketplace, para la reunión de Agustín.
  - `INVESTIGACION-modelo-destino-prompt-guides.md` — investigación (ciclo 0) de prompt-guides por modelo destino; **alimenta el ciclo 4**.
  - `handoffs/` — **bitácoras de cierre de sesión** (snapshots fechados con evidencia; pueden abarcar varios ciclos).
- **Nivel ciclo (`ciclo-N-<slug>/`):** artefactos JCC de ese ciclo (DESIGN, SPEC, RUNBOOK, y la REVIEW como ADDENDUM dentro del DESIGN).

## Índice de ciclos y estado

| Ciclo | Carpeta | Estado |
|---|---|---|
| 0 — preparación | *(en raíz: BRIEF + INVESTIGACION)* | investigación ✅ (Gemini/optimizadores = top-up en ciclo 4); burocracia Partner Center pendiente (Agustín) |
| 1 — `identidad-entra` | `ciclo-1-identidad-entra/` | **CERRADO** — en prod, login e2e verificado |
| 2 — `frontend-mobile-first` | `ciclo-2-frontend-mobile-first/` | **2a diseño COMPLETO** (dirección "B · Papel" en Claude Design) · **2b en construcción: SPEC-01 `cimiento` CERRADO** (frontend `web/` desplegado en `/app`, R5 verificado en Azure) → siguiente: `/jcc-spec` del SPEC-02 (API tipada) |
| 3 — `marketplace-transactable` | *(pendiente)* | landing + webhook + Fulfillment APIs + suscripciones + gating |
| 4 — `destilado-destino` | *(pendiente)* | selección modelo destino + ajustes de formato (funcionalidad estrella) |
| 5 — `uso-y-costes` | *(pendiente)* | fair-use + costes visibles |
| 6 — `backoffice-minimo` | *(pendiente)* | métricas + suscripciones + consumo |
| 7 — `publicacion` | *(pendiente)* | ficha + certificación + compra de prueba |

*(Refinamiento pendiente del troceo: la configuración de Marketplace/Partner Center quizá merezca un ciclo/track propio explícito; decidir al llegar al ciclo 3.)*

## Documentos por ciclo (existentes)

- **Ciclo 1** `ciclo-1-identidad-entra/`: `DESIGN.md` (con ADDENDUM de review), `SPEC.md`, `RUNBOOK-entra-y-cutover.md`.
- **Ciclo 2** `ciclo-2-frontend-mobile-first/`: `DESIGN.md` (encuadre del ciclo); **2a** → `DESIGN-2a.md`, `BRIEF-claude-design-2a.md`, `DESIGN-SYSTEM-2a.md`, `diseno-claude-design/` (snapshots de Claude Design); **2b** → `SPEC-01_cimiento.md` (con ADDENDUM del stack). Código en `web/`.

## Handoffs (bitácoras de sesión)

- `handoffs/HANDOFF-2026-07-18.md` — cierre del ciclo 1 (cutover a prod verificado) + arranque del ciclo 2.
- `handoffs/HANDOFF-2026-07-20.md` — ciclo 2: 2a diseño completo (Claude Design) + SPEC-01 `cimiento` de 2b cerrado (desplegado, R5 verificado en Azure).
