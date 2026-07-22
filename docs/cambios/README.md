# Índice global de cambios — `docs/cambios/`

Mapa de **todos los cambios** del proyecto, uno por carpeta. Este índice es estable y de navegación.

> **Estado vivo canónico:** la línea **"Fase actual"** del bloque JCC en [`CLAUDE.md`](../../CLAUDE.md) (raíz del repo) — es un **puntero corto al trabajo ACTIVO**, se sobrescribe, no acumula historia.
> **Documentación por cambio:** cada carpeta `NNNNNNNN_<slug>/` tiene sus propios artefactos JCC (DESIGN, SPEC, REVIEW…). Un **cambio normal** = una carpeta con DESIGN/SPEC/REVIEW; un **programa** multi-ciclo = una carpeta con su `README.md` + subcarpetas por ciclo.
> **Historia fechada con evidencia:** vive en los `HANDOFF-*.md` / `*_Cierre_Sesion.md` de cada carpeta (los programas los agrupan en `handoffs/`). Ahí está el detalle de commits, deploys, veredictos de review y gotchas.

## Tabla de cambios

| Fecha | Cambio | Qué es (1 línea) | Tipo | Estado | Docs |
|---|---|---|---|---|---|
| 2026-06-23 | `azure-sql-multiusuario` | Migración de local/monousuario a **Azure SQL + Blob Storage + multiusuario** (identidad, aislamiento por `owner_id`, coste); secretless por Managed Identity y red privada. | cambio | **cerrado** (en prod) | [carpeta](20260623_azure-sql-multiusuario/) · cierre: `20260625_Fase_06_Implementada.md` |
| 2026-06-26 | `mejorar-destilado-gpt` | Afinado del prompt `completo` para GPT + elección de modelo (`gpt-4.1`) por eval contra golden. | cambio | **cerrado** (en prod) | [carpeta](20260626_mejorar-destilado-gpt/) · cierre: `20260626_Cierre_Sesion.md` |
| 2026-06-28 | `grabacion-stop-espontaneo` | Telemetría `diagnostic_events` + **salvaguarda de stop externo** (recupera el audio ante corte espontáneo). Diagnóstico + red de seguridad, no el fix definitivo. | cambio | **cerrado** (en prod) | [carpeta](20260628_grabacion-stop-espontaneo/) · [`HANDOFF.md`](20260628_grabacion-stop-espontaneo/HANDOFF.md) |
| 2026-06-28 | `mejorar-destilado-limpio` | Afinado del prompt `limpio` para GPT (limpia/estructura preservando la voz/persona del hablante). | cambio | **cerrado** (en prod) | [carpeta](20260628_mejorar-destilado-limpio/) · cierre: `20260628_Cierre_Sesion.md` |
| 2026-07-10 | `robustez-coldstart-sql` | Robustez ante el **cold-start de Azure SQL Serverless** (warm-up de BD + banner Reintentar) para no perder audio al guardar. | cambio | **desplegado; review limpia** — pendiente SOLO la prueba de fuego §8.3 (cold-start real, coordinar con Agustín) | [carpeta](20260710_robustez-coldstart-sql/) · [`HANDOFF.md`](20260710_robustez-coldstart-sql/HANDOFF.md) |
| 2026-07-16 | `profesionalizacion-marketplace` | **Programa multi-ciclo** para profesionalizar la app y publicarla en Azure Marketplace (identidad Entra, frontend nuevo, transacción, destilado por destino, costes, backoffice, publicación). | **programa** | **ACTIVO** | [carpeta](20260716_profesionalizacion-marketplace/) · [`README.md`](20260716_profesionalizacion-marketplace/README.md) · [`handoffs/`](20260716_profesionalizacion-marketplace/handoffs/) |

## Nota sobre el programa activo

`profesionalizacion-marketplace` es un programa de **7 ciclos** con su propio índice en su [`README.md`](20260716_profesionalizacion-marketplace/README.md). Resumen de ciclos: 0 preparación (investigación ✅) · 1 `identidad-entra` (**cerrado**, en prod) · 2 `frontend-mobile-first` (**cerrado**, en prod; frontend nuevo React/Vite mobile-first + PWA en la raíz `/`, SPEC-01…07 con smoke del usuario) · 3 `marketplace-transactable` · 4 `destilado-destino` · 5 `uso-y-costes` · 6 `backoffice-minimo` · 7 `publicacion`. El detalle vivo está en la "Fase actual" de `CLAUDE.md`.
