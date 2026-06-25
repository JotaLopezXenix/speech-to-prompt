# Documentación de Speech-to-Prompt

Índice y convenciones de la carpeta `docs/`. Esta carpeta crece con el proyecto; mantén cada documento en su subcarpeta y añádelo aquí.

## Estructura

| Carpeta | Contiene |
|---|---|
| `diseno/` | Análisis y diseño del producto. **Historia**: se consulta para entender decisiones, no se reabre. |
| `cambios/` | *Delta-specs* de la metodología: un documento por cambio acotado (qué se añade/modifica, qué se preserva, verificación). |
| `metodologia/` | La **metodología vigente** de desarrollo con Claude Code (los prompts y fases que se copian para trabajar). |

## Convención de nombres

- Documentos nuevos: `AAAAMMDD_<slug-en-kebab>.md` (p. ej. `20260622_migracion-db.md`).
- Los documentos de diseño antiguos conservan su nombre original por trazabilidad.

## Contenido actual

### `diseno/`
- [Análisis y diseño inicial — 2026-04-09](<diseno/Speech-to-prompt. Análisis y diseño inicial - 20260409.md>) — diseño completo original (nube, auth, BD, móvil).
- [Diseño solo Windows en local — 2026-04-10](<diseno/Speech-to-prompt. Diseño solo Windows en local - 20260410.md>) — el enfoque simplificado local que se construyó como v1.
- [Estado actual (as-built) — 2026-06-10](<diseno/Speech-to-prompt. Estado actual (as-built) - 20260610.md>) — qué existe hoy + análisis prospectivo de salto a producto.
- [Análisis para despliegue en Azure — 2026-06-16](<diseno/20260616_Analisis_para_despliegue_en_Azure.md>) — plan y as-deployed de la prueba online con socio (App Service + Easy Auth).

### `cambios/`
- [Migración a Azure SQL + multiusuario real — 2026-06-23](<cambios/20260623_azure-sql-multiusuario/DESIGN.md>) — DESIGN del salto a Azure SQL Database, Blob Storage para audio, identidad real y aislamiento por usuario, con seguridad profesional para uso interno en Xenix con dato de cliente.
  - [SPEC flujo 1 — capa de datos SQL + arranque en blanco](<cambios/20260623_azure-sql-multiusuario/SPEC-01_capa-datos-sql.md>) — esquema físico (id surrogate), reescritura de `session-store` a SQL preservando el contrato, runner de migraciones y arranque con BD en blanco (sin importar los datos viejos). **(construido y verificado)**
  - [SPEC flujo 2 — identidad real + aislamiento](<cambios/20260623_azure-sql-multiusuario/SPEC-02_identidad-aislamiento.md>) — middleware que lee el principal de Easy Auth (simulado en local), JIT-provisioning en `users` y aislamiento por propietario forzado en la capa de datos. **(construido y verificado)**
  - [SPEC flujo 3 — audio a Blob Storage](<cambios/20260623_azure-sql-multiusuario/SPEC-03_audio-blob-storage.md>) — abstracción `BlobStore` (ficheros en local, Azure Blob en la nube), audio fuera del FS de la app, endpoint autorizado para servir audio y reprocess desde el store. **(construido y verificado en local; `azure.js` pendiente de provisión)**
  - [SPEC flujo 5 — registro de uso + coste por sesión](<cambios/20260623_azure-sql-multiusuario/SPEC-05_usage-coste.md>) — tabla append-only `usage_events` (cantidades crudas), precios en tabla `model_prices` (editable por SQL), coste estimado por sesión, endpoint `GET /:id/usage` y coste en la fase 5. **(construido y verificado)**

### `metodologia/`
_La versión vigente se coloca aquí._
