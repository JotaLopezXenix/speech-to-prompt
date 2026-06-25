# Migración a Azure SQL Database + multiusuario real — DESIGN

**Fecha:** 2026-06-23
**Tipo:** cambio sobre código existente (v1.2, rama `main`).
**Estado:** diseño acordado en entrevista. **No se implementa nada en este documento.** El detalle técnico (DDL, código, comandos `az`, esquema físico) es la **fase siguiente**.

> **Trazabilidad.** Continúa y se apoya en:
> - `docs/diseno/Speech-to-prompt. Estado actual (as-built) - 20260610.md` (estado as-built y sección 11, análisis de salto a multiusuario).
> - `docs/diseno/20260616_Analisis_para_despliegue_en_Azure.md` (despliegue actual en Azure App Service + Easy Auth, espacio compartido).

> **Nota de seguridad.** Este documento **no contiene ninguna API key ni secreto**. Las claves siguen en App Settings (entorno). Ninguna decisión de aquí implica escribir credenciales en el repo.

---

## 1. Resumen ejecutivo

La aplicación pasa de **almacenamiento en ficheros JSON locales + espacio compartido** a una **arquitectura profesional sobre Azure**: los datos estructurados van a **Azure SQL Database**, los audios a **Azure Blob Storage**, y la aplicación se vuelve **multiusuario real** (cada persona ve por defecto solo sus sesiones), con **seguridad y confidencialidad de grado profesional** porque se va a usar **internamente en Xenix con material de proyectos de clientes finales**.

El criterio rector, más allá de lo técnico, es **concentrar todo en recursos Azure**: mejora la relación de Xenix con Microsoft (créditos por consumo), encaja con el horizonte de **Azure Marketplace** y simplifica confidencialidad (un solo perímetro). Esto se hace **con los pies en el suelo**: lo mínimo profesional para usar la herramienta internamente ya, dejando el esquema **preparado** para la futura evolución a SaaS (web + móvil) **sin hipotecarla ni sobredimensionar el presente**.

---

## 2. Objetivo y problema

**Problema.** El estado actual (ver as-built) tiene tres límites que impiden el uso interno con dato de cliente:

- **Persistencia en ficheros JSON** bajo `data/`: sin índices, transacciones ni concurrencia; no aísla por usuario.
- **App ciega a la identidad**: Easy Auth pone la puerta de login, pero el código Node nunca lee quién entró → **un único espacio compartido** (tú y Agustín veis todo).
- **Audio en el disco de la app**, sin servirse por API y sin control de acceso por usuario.

**Objetivo.** Dotar a la aplicación de:

1. **Azure SQL Database** como repositorio de los datos estructurados (transcripciones, prompts destilados, metadatos de sesión).
2. **Azure Blob Storage** para los audios, fuera del FS de la app.
3. **Multiusuario real**: identidad de la persona leída de la autenticación, **aislamiento por propietario** (cada uno ve lo suyo por defecto).
4. **Seguridad/confidencialidad profesional**: cifrado en reposo, acceso secretless, perímetro de red cerrado, procesadores externos con garantías de residencia/DPA.

---

## 3. Usuarios y casos de uso

**Usuarios (esta iteración):** 2-4 personas del tenant **Xenix** en Entra ID (miembros o invitados B2B). Uso esporádico. No hay registro público.

**Casos de uso preservados** (no cambian de cara al usuario): capturar dictado multi-segmento → revisar → destilar (4 modos) → resultado; importar audio; reprocesar; historial; ajustes.

**Casos de uso nuevos / modificados:**

- **Login con identidad efectiva:** al entrar, la app sabe **quién** eres y solo te muestra **tus** sesiones.
- **Aislamiento:** el historial, la apertura de sesión y todas las operaciones se restringen al propietario.
- **Coste por sesión:** la app registra el consumo (tokens / minutos de audio) de cada llamada a modelo, para estimar el coste de cada sesión.
- **Inspección administrativa de datos** (operación, no in-app): tú y Agustín podréis conectaros a SQL (SSMS) y a Storage (Storage Explorer) con vuestra identidad Entra para ver cómo se guarda todo.

---

## 4. Alcance

### 4.1 Dentro de alcance (esta iteración)

- Sustituir el almacén de ficheros por **Azure SQL Database**, **preservando el contrato público** de `session-store` y la forma del objeto sesión.
- **Migración puntual** de los datos existentes (sesiones JSON + audios `.webm`) a SQL + Storage, con **dueño = Jesús**.
- **Audios a Azure Blob Storage** (contenedor privado), con nuevo **endpoint de servir audio con autorización** y **Reprocesar leyendo de Storage**.
- **Identidad real**: middleware que lee el principal de Easy Auth; tabla `users` con **JIT-provisioning** en el primer login.
- **Aislamiento por propietario** forzado en la capa de datos.
- **Modelo de datos preparado para compartir** (tabla `session_shares`) — **solo esquema, sin funcionalidad**.
- **Registro de coste/uso** (`usage_events`, append-only) — **activo**.
- **Procesadores Azure-nativos / UE con garantías de confidencialidad**: STT → **Azure OpenAI Whisper**; LLM → **Claude vía Azure AI Foundry**.
- **Seguridad de red**: **Private Endpoints + VNet** para SQL y Storage; **Managed Identity** para el acceso de la app; cifrado en reposo (por defecto) y auditoría.

### 4.2 Fuera de alcance (diferido, sin hipotecar)

- **Compartir funcional** (UI + endpoints para compartir una sesión): el esquema queda listo, la función no.
- **Versionado del texto** (conservar transcripciones/prompts anteriores): **preparado en el esquema, no activo**.
- **Rol administrador / vistas compartidas dentro de la app.**
- **Clientes web públicos y app móvil + API pública** (la gran evolución SaaS).
- **Facturación, cuotas, BYOK, planes.**
- **VPN punto-a-sitio** para acceso administrativo (se arranca con lista blanca de IPs; ver 6).
- **Política de retención/limpieza** del dato de cliente (anotada como pregunta abierta).
- **`config.json` / gestión de claves**: sin cambios; las claves siguen en App Settings.
- **ffmpeg en el servidor**: sigue ausente (modo degradado), igual que hoy.

---

## 5. Decisiones acordadas

Las marcadas **⬛ ESTRUCTURAL** condicionan el futuro o son difíciles de revertir; se decidieron **juntos**. Las marcadas **🔧 reversible** las propuse yo y son ajustables sin migrar datos.

| # | Decisión | Tipo |
|---|----------|------|
| D1 | **Azure SQL Database** como repositorio de datos estructurados. (Elección firme de Xenix por afinidad del equipo; no se reabre.) | ⬛ ESTRUCTURAL |
| D2 | **Audio en Azure Blob Storage**, contenedor privado, **servido a través de la app con autorización** (nunca URL pública directa). No se guarda en SQL. | ⬛ ESTRUCTURAL |
| D3 | **App → SQL con Managed Identity** (sin usuario/contraseña en App Settings). Es la identidad *de la app*, una sola; los usuarios no tocan SQL. | ⬛ ESTRUCTURAL |
| D4 | **Autenticación de personas delegada en Entra/Easy Auth.** Tabla `users` con **clave externa estable (oid) + email**, **agnóstica de proveedor**, para no hipotecar el futuro Entra External ID (CIAM). | ⬛ ESTRUCTURAL |
| D5 | **Aislamiento por propietario** por defecto; forzado en la capa de datos (no solo en la UI). | ⬛ ESTRUCTURAL |
| D6 | **Compartir = solo esquema** (`session_shares`). Comportamiento actual: aislamiento estricto. | ⬛ ESTRUCTURAL (gancho) |
| D7 | **`transcription_raw` se mantiene como vista materializada** (concatenación de segmentos) para no romper a los consumidores actuales. | ⬛ ESTRUCTURAL |
| D8 | **Registro de coste/uso** en `usage_events` (append-only): cantidades **crudas** (tokens in/out, segundos de audio); el coste se **deriva** de una tabla de precios por modelo. **Activo.** | ⬛ ESTRUCTURAL |
| D9 | **Histórico de reproceso = registro de llamadas** (vía `usage_events`). **Versionado del texto preparado pero NO activo.** | ⬛ ESTRUCTURAL (gancho) |
| D10 | **Procesadores Azure-nativos/UE**: STT → **Azure OpenAI Whisper** (terminar `azure-whisper.js`); LLM → **Claude vía Azure AI Foundry** (proveedor nuevo). Criterio: confidencialidad + "todo en Azure". | ⬛ ESTRUCTURAL |
| D11 | **Red: Private Endpoints + VNet** para SQL y Storage (sin acceso público para el tráfico de la app). | ⬛ ESTRUCTURAL |
| D12 | **Acceso administrativo (SSMS/Storage Explorer): lista blanca de IPs** de Jesús y Agustín + auth Entra/MFA (postura "a"). VPN punto-a-sitio diferida. | 🔧 reversible |
| D13 | **Azure SQL Serverless con auto-pausa** + **reintento de conexión** en la app (mitiga el arranque en frío ~30-60 s). Nivel ajustable con el crecimiento. | 🔧 reversible |
| D14 | **Driver `mssql` + migraciones SQL escritas a mano** (sin ORM pesado; respeta el espíritu de mínimas dependencias del proyecto). | 🔧 reversible |
| D15 | **Sesiones existentes → dueño = Jesús** en la migración. | ⬛ ESTRUCTURAL (dato) |
| D16 | **Sin rol admin in-app** esta iteración; la inspección de datos se hace a nivel BD/Storage. | 🔧 reversible |

---

## 6. Acceso administrativo bajo Private Endpoints (detalle de D11/D12)

Punto que conviene dejar escrito porque generó duda: **"endpoint privado" y "acceso público" son interruptores independientes.** El tráfico de la app va por el endpoint privado; el acceso administrativo se resuelve aparte.

- **SSMS contra Azure SQL:** funciona con normalidad, autenticando con la **cuenta Xenix vía Entra MFA** (no contraseña SQL).
- **Storage:** se inspecciona con **Azure Storage Explorer**/portal y un **rol RBAC** Entra (p. ej. *Storage Blob Data Reader/Contributor*), sin claves.
- **Postura elegida (D12):** endpoint privado para la app + **lista blanca de las IPs de los dos administradores** en el firewall. SSMS/Storage Explorer funcionan directos desde vuestros equipos, sin VPN, y la única superficie pública extra son esas IPs. Si en el futuro se quiere **superficie pública cero**, se pasa a **VPN punto-a-sitio** (reversible, no toca datos ni esquema).

---

## 7. Modelo de datos (lógico)

Nivel de diseño — entidades, relaciones y campos clave. El esquema físico (tipos, índices, restricciones, vista materializada vs columna calculada) es de la fase de implementación.

```
users 1───N sessions 1───N segments
                │
                ├───N session_shares   (gancho de compartir; sin función aún)
                └───N usage_events      (registro de coste/uso; append-only)
```

- **users** — `id` (surrogate), `external_id` (oid de Entra, clave estable), `email`, `display_name`, `created_at`, `last_login_at`. Rellenada por **JIT-provisioning** en el primer login a partir de los claims de Easy Auth. Agnóstica de proveedor de identidad.
- **sessions** — conserva el **`id` actual (timestamp)** como identificador para no romper referencias ni la migración; `owner_id → users`; `timestamp`; `transcription_raw` (**vista materializada**), `transcription_edited`; `prompt_distilled`, `distill_mode`, `distill_prompt_used`; `llm_provider/llm_model`, `stt_provider/stt_model`.
- **segments** — `id`; `session_id → sessions`; `ordinal` (1-based, sustituye a `nextSegmentNumber`); `audio_blob_path` (referencia a Storage, sustituye a `audio_file` en disco); `transcription_raw`, `transcription_edited`; `duration_seconds`; `source` (`recorded`|`imported`); `created_at`.
- **session_shares** *(solo esquema)* — `session_id`, `shared_with_user_id`, `permission`, `created_at`, `created_by`. Presente para activar compartir (opción C) sin migrar después.
- **usage_events** *(append-only)* — `id`; `session_id`; `segment_id?`; `kind` (`stt`|`llm`); `provider`, `model`; `input_tokens?`, `output_tokens?` (LLM); `audio_seconds?` (STT); `created_at`. El **coste se calcula**, no se almacena, a partir de una **tabla/mapa de precios por modelo** (referencia configurable, sobrevive a cambios de precio y al cambio de procesadores).

**Audio en Storage:** contenedor privado; ruta por sesión/segmento (p. ej. `<session_id>/seg-<n>.webm`); la app **escribe** al subir el segmento, **sirve** vía endpoint autorizado, y **Reprocesar** lee de ahí.

---

## 8. Qué se PRESERVA (superficie de regresión)

La línea de defensa es **mantener idéntico el contrato público de `session-store` y la forma del objeto sesión**; así el resto no se entera del cambio de almacén.

- **Forma del objeto sesión**: `segments[]` + `transcription_raw`/`transcription_edited` materializados + campos de destilación. Lo leen sin cambios **`distill.js`**, el **historial** y las **4 fases** del front.
- **Vista materializada `transcription_raw`** (D7): los consumidores siguen leyendo el texto unificado sin saber de segmentos.
- **Máquina de 4 fases del front** (1-captura → 3-revisión → 4-destilación → 5-resultado) y el **contrato de `api-client`**: sin cambios de cara al usuario.
- **Abstracción de proveedores LLM/STT** (clases base + registries): se **añaden** proveedores (Foundry, terminar Azure Whisper); no se cambia el contrato base.
- **Easy Auth** como puerta de login: se conserva; ahora además **se lee** la identidad.
- **`config.json` + overlay de claves por entorno**: sin cambios.

**Cambios controlados (lo que sí se toca):**

- `session-store` pasa a **async** (SQL) → contagio acotado a **3 ficheros de rutas** (`sessions.js`, `transcribe.js`, `distill.js`); los handlers de transcribe/distill ya son `async`. Helpers puros (`getSegments`, `recomputeTranscription`) se conservan donde se pueda.
- **Identidad/aislamiento**: nuevo middleware (principal de Easy Auth → usuario) y **`listSessions`/`getSession` filtrados por propietario** en la capa de datos.
- **Audio**: la escritura (`copyFileSync` → Storage), la lectura de **Reprocesar** (disco → Storage) y un **endpoint nuevo de servir audio** con autorización (hoy no existe).
- **Recompute transaccional**: insertar segmento + recalcular `transcription_raw` debe ser **atómico** en SQL (mejora respecto a los ficheros, pero hay que hacerlo bien).

---

## 9. Descomposición y orden sugerido (dentro de esta iteración)

No es un cambio, son varios. Todos entran en esta iteración, pero conviene secuenciarlos para de-riesgar. **D1+D4+D5 son el núcleo indivisible** (meter SQL sin el `owner` obligaría a migrar dos veces).

1. **Capa de datos SQL** — reescribir las tripas de `session-store` contra SQL preservando su contrato (D1, D7, D14); migración de datos existentes con dueño = Jesús (D15).
2. **Identidad + aislamiento** — middleware de principal, tabla `users` con JIT (D4), filtro por propietario (D5), `session_shares` solo esquema (D6).
3. **Audio a Storage** — escritura/lectura/servir + Reprocesar desde Storage + migración de blobs (D2).
4. **Procesadores Azure-nativos** — terminar `azure-whisper.js`, nuevo proveedor Claude/Foundry, cambiar defaults (D10).
5. **Coste/uso** — `usage_events` + mapa de precios (D8, D9).
6. **Endurecimiento de red/seguridad** (infra, en paralelo) — Private Endpoints + VNet, Managed Identity, lista blanca de IPs, auditoría, cifrado en reposo (D3, D11, D12).

---

## 10. Supuestos

- Jesús y Agustín están en el **mismo directorio Entra** de Xenix; el alta de nuevos usuarios internos es vía Entra (miembro o invitado B2B).
- **Claude está disponible en Azure AI Foundry** en una región UE con paridad de modelo suficiente para la destilación (a verificar en implementación; ver riesgos).
- El **volumen es bajo** (2-4 personas, uso esporádico): Serverless con auto-pausa es coste-adecuado.
- El **modo degradado de ffmpeg** sigue siendo aceptable (audios cortos); el troceo de audios largos no es objetivo de esta iteración.
- El número de **sesiones/audios a migrar** es manejable como tarea puntual (decenas, no miles).

---

## 11. Riesgos

- **Managed Identity en desarrollo local:** MI no existe fuera de Azure. El desarrollo local necesita una vía alternativa (credenciales de desarrollador Azure o conexión de dev). A resolver en implementación; documentar.
- **Arranque en frío de Serverless:** la primera conexión tras la pausa puede tardar/timeout. Mitigado por **reintento de conexión** (D13); si molesta, desactivar auto-pausa.
- **Migración de dato confidencial:** los datos existentes incluyen material de cliente (hubo un incidente de confidencialidad previo). La migración debe hacerse con cuidado y verificando el perímetro **antes** de mover nada.
- **Claude en Foundry:** disponibilidad regional, **nombres de modelo distintos** a los actuales (`claude-sonnet-4-6`, etc.) y posibles diferencias de API. Verificar antes de comprometer el cambio de defaults.
- **Mantenimiento del mapa de precios:** el coste es una **estimación**; depende de mantener la tabla de precios al día, sobre todo al cambiar de procesadores.
- **Acceso administrativo con Private Endpoints:** la lista blanca de IPs (D12) asume IPs estables; IPs domésticas dinámicas pueden dar fricción → posible empujón anticipado a VPN.
- **Atomicidad del recompute:** insertar segmento y recalcular `transcription_raw` deben ir en transacción; un fallo a medias dejaría la vista materializada incoherente.

---

## 12. Preguntas abiertas (diferidas, no bloquean)

- **Política de retención/limpieza** del audio y las transcripciones de cliente.
- **Cuándo y cómo se activa compartir** (UI + endpoints sobre `session_shares`).
- **Cuándo se activa el versionado de texto** (el esquema ya lo prevé).
- **Rol administrador / vistas compartidas** dentro de la app (hoy, inspección a nivel BD).
- **Backoffice de administración** (futuro): UI para gestionar usuarios/roles y **editar los precios de modelos** (tabla `model_prices`). De momento los precios se editan a mano por SQL.
- **Paso a VPN** (superficie pública cero) según crezca el equipo o el nivel de exigencia.
- **Evolución a SaaS** (web/móvil, API pública, billing/cuotas/BYOK, Entra External ID): aún sin decidir el "cómo".

---

## Addendum 2026-06-24 — cambios sobre el diseño original (implementados)

El cuerpo de arriba es el diseño acordado el 23-jun. Durante la implementación del **flujo 4** surgieron dos cambios que **modifican decisiones de este DESIGN**; se registran aquí:

- **D10 corregida — el LLM ya NO es Claude.** Restricción de facturación dura: los costes **deben** ir contra el **crédito de la suscripción**, sin cargos a tarjeta. Confirmado con docs de Microsoft: Claude (en Foundry o directo) es oferta de **Azure Marketplace** y **el crédito no lo cubre**; **Azure OpenAI es first-party y sí**. Por tanto el destilador pasa a **Azure OpenAI GPT (`gpt-4.1`)**, reutilizando el recurso `aoai-speech-to-prompt` (West Europe) del STT — un solo recurso/región/billing/auth. **STT (Azure OpenAI Whisper) sin cambios.** Proveedores: `src/providers/stt/azure-whisper.js` y el nuevo `src/providers/llm/azure-openai.js` (Chat Completions por REST; auth api-key o Managed Identity). (Se llegó a escribir y luego **retirar** un proveedor `foundry.js` para Claude-en-Foundry, descartado por la facturación; región de Claude además era solo East US 2 / Sweden Central.)
- **Nuevo — prompts multi-modelo en BD.** Al validar gpt-4.1 se vio que los prompts (afinados para Claude) desvían en modo `completo`. Decisión: **prompts por FAMILIA de modelo × modo, en BD** (`model_prompts`, familias `openai`/`claude`/`gemini`), con un **registro de modelos** (`llm_models`) que marca `enabled`/`is_default` y permite **rechazar** modelos deshabilitados. **Claude se conserva (sus prompts) pero deshabilitado.** Selección de modelo **global** ahora (config/env), por usuario/cliente en el futuro SaaS. Origen versionado en `src/prompts/<familia>/<modo>.md`, sembrado a BD con `npm run seed-prompts`. Las **API keys siguen fuera de la BD** (env/`config.json`): la BD aloja solo config no-secreta (precios, prompts, registro de modelos).
- **Migraciones añadidas:** `003_azure_openai_prices.sql` (precios gpt-4.1), `004_multimodel_prompts.sql` (`model_prompts` + `llm_models`). Servicios nuevos: `services/prompts.js`, `services/models.js`.
- **Estado:** implementado y verificado en local (STT y LLM Azure, gating, prompts por familia, destilado gpt-4.1 validado en `limpio` y `completo`). **Pendiente:** flujo 6 (Private Endpoints + VNet + Managed Identity en Azure) y provisionar los recursos Azure reales de SQL/Storage.
