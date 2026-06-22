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
_Vacía por ahora. Cada cambio acotado deja aquí su delta-spec._

### `metodologia/`
_La versión vigente se coloca aquí._
