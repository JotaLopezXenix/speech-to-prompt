# HANDOFF (recuperación) — sesiones 23-jul (tarde), 27-jul y 28-jul-2026 · Ciclo 3

**Bitácora de recuperación escrita el 29-jul-2026.** No es la foto de una sesión: reconstruye **tres tandas de trabajo que se quedaron sin handoff**, cerrando el hueco H-06 de la [`AUDITORIA-integridad-documental-2026-07-28.md`](../AUDITORIA-integridad-documental-2026-07-28.md) (enmienda 4 de su §6). Continúa a [`HANDOFF-2026-07-23.md`](HANDOFF-2026-07-23.md), que cerró con SPEC-01 **«SIN desplegar»** — desde ahí, cinco días de trabajo real cuya evidencia vivía en mensajes de commit y en la línea sobrescribible de «Fase actual».

> **Cómo leer las evidencias.** Se marca la procedencia de cada dato porque no todo se comprobó en la misma sesión:
> **[git]** = `git log`/`git show` en la sesión del 29-jul · **[cód]** = lectura de código en la sesión del 29-jul ·
> **[aud]** = medición de la auditoría del 28-jul contra BD de producción (SELECT con identidad Entra), Azure (`az`, solo lectura), producción (curl) o MS Learn.
> Lo que no se comprobó, se dice.

---

## Sesión A — 23-jul-2026, tarde · **Deploy de SPEC-01 a producción**

El único artefacto que dejó fue el commit **`6691fd2`** (23-jul 19:14:38+02:00), que **solo tocó `CLAUDE.md`** [git]. La evidencia del despliegue estaba, literalmente, en su mensaje.

**Qué se hizo:** desplegar el gate por `entitlements` respetando el orden crítico que el SPEC-01 §5 y el handoff del 23 prescribían — **`npm run migrate` + `scripts/sql/seed-entitlements-cutover.sql` ANTES de desplegar el código** (si se despliega antes de sembrar, Jesús y Agustín reciben `403 NO_ACCESS`). El pipeline de despliegue **no aplica migraciones** — `.github/workflows/azure-deploy.yml` solo construye el bundle de Vite y publica [cód] —, así que migrar y sembrar es una secuencia manual desde local contra Azure SQL (`SQL_AUTH=entra-default`).

**Verificado con evidencia real** [aud]:

| Qué | Evidencia |
|---|---|
| Migración `007_entitlements.sql` aplicada en prod | `schema_migrations`: **23-jul 16:40:35Z** |
| Semilla de cutover ejecutada | `entitlements` = **2 filas manuales activas**: Jesús `owner_id=1` (16:41Z) y **Agustín pre-login `owner_id=NULL`** (17:10Z), ambas con nota de cutover |
| Fix H6 (`users.email` admite NULL) | esquema de `users` en prod |
| Gate vivo con el criterio del SPEC | `identity.js:57-59` — `bind → hasActiveAccess → 403 NO_ACCESS` |
| Lista blanca retirada del código | `src/utils/allowlist.js` y su test **no existen**; OpenAPI y `schema.d.ts` dicen `NO_ACCESS` |
| Smoke real post-deploy (no solo curl) | evento **STT en prod 23-jul 16:51:14Z** (11 min tras la migración) + destilado el 24-jul |
| Tests | `npm test` **16/16** (re-ejecutado el 28-jul) |

**El «fix del orden migrate+seed»: RECONSTRUIDO — fue una caída de producción de ~8 h.** Se dio por irreconstruible al empezar la sesión (ningún artefacto lo explicaba: ni el cuerpo del commit, ni el SPEC-01, ni el runbook). Apareció en la **memoria de proyecto** de Claude y se **corroboró con evidencia primaria** antes de escribirlo. Lo sustantivo:

El código del gate llegó a producción **antes** de que existiera `dbo.entitlements`, y el gate no degradó a 403: el middleware lanzaba **500 `IDENTITY_FAILED`** (`Invalid object name 'dbo.entitlements'`) en **toda petición autenticada**. Causa raíz: **`.github/workflows/azure-deploy.yml` despliega en cada push a `main`** (`on: push: branches: [main]`, líneas 9-13 [cód]) → la sesión de la mañana commiteó y pusheó creyendo dejarlo «pusheado, SIN desplegar» (así lo declara su handoff) y el pipeline lo desplegó en 2 minutos. Cronología [git, `gh run list`, aud]:

| Hora (UTC) | Hecho |
|---|---|
| 08:31:27 → 08:33:19 | push de `eb21a2c..d20d304` → **deploy del gate a producción** |
| **16:40:35** | migración 007 aplicada → fin de la caída |
| 16:41 · 16:51:14 · 17:10 | seed (Jesús) · primer evento STT (smoke real) · concesión pre-login de Agustín |
| 17:14:38 | commit `6691fd2` |

**El detalle completo, con los dos defectos del §6 de SPEC-01 y la regla que hereda SPEC-02, se ha escrito donde toca: [`SPEC-01_modelo-acceso-gate.md` → ADDENDUM 2026-07-29](../ciclo-3-marketplace-transactable/SPEC-01_modelo-acceso-gate.md).** En resumen: el orden correcto no es «migrar antes de desplegar» sino **migrar antes de PUSHEAR**; sin migración no hay 403 degradado sino 500 general; migrar contra Azure no es `npm run migrate` (cargaría el `.env` local) sino `node scripts/migrate-db.js` con la conexión de producción explícita y `SQL_AUTH=entra-default`; y el seed de cutover no cubre a quien nunca se ha logueado (`FROM dbo.users`) — de ahí la concesión **pre-login** de Agustín, primera prueba real en producción del binding que SPEC-03 necesitará.

Restaurar fue **solo BD** (sin re-deploy ni reinicio: el código correcto ya estaba desplegado), y un dictado de ~14 min sin subir sobrevivió en `pendingRetryRef` y se recuperó con **Reintentar** — la salvaguarda R1 del ciclo 2 funcionando en un incidente real.

> **Por qué importa más que la crónica:** el §6 de SPEC-01 es la plantilla mental con la que se desplegará SPEC-02. Estaba mal en dos puntos y nadie lo había corregido; el commit que decía «fix» no arregló el documento, solo describió el resultado.

---

## Sesión B — 27-jul-2026 · **SPEC-02 especificado, ANALISIS de costes, retirada de `ALLOWED_EMAILS`, volcado de la reunión**

Cuatro entregas en una sesión larga, ninguna con bitácora. Commits [git]:

| Commit | Hora | Qué |
|---|---|---|
| `48129d6` | 12:17 | Adopción de **JCC v1.3** en el bloque `CLAUDE.md` (solo `CLAUDE.md`) |
| `a6983bd` | 18:21 | **Retirada del App Setting `ALLOWED_EMAILS`** en Azure + poda del Backlog (solo `CLAUDE.md`) |
| `382c6b6` | 19:19 | **`SPEC-02_fulfillment-secretless.md`** (323 líneas, nuevo) + **volcado de la reunión del 23-jul** (`BRIEF-…-23.md §6`, con su transcripción `.docx`) + **`BRIEF-…-29.md`** (nuevo) + runbook, README e índice global al día |

**1 · SPEC-02 `fulfillment-secretless` (Fase 2).** Cliente de las SaaS Fulfillment APIs **sin secretos**: app de Entra dedicada single-tenant + **UAMI como credencial federada** (decisión de mesa común del 27-jul: UAMI y no la MI de sistema, por ser el único camino documentado y por sobrevivir a que se recree el App Service), cliente HTTP con reintentos e idempotencia por `x-ms-requestid`, doble local con fixtures, script de humo. **Sin dependencias nuevas ni cambios en código existente.** Cierra el supuesto **S1** del ciclo: la credencial federada es viable porque `AADSTS700236` solo aplica a escenarios **cross-tenant** y el caso Xenix es same-tenant — confirmado después contra fuente primaria [aud, §3.2].

**2 · Retirada de `ALLOWED_EMAILS` en Azure.** Cierra la deuda que SPEC-01 dejó abierta: el App Setting era código muerto desde el deploy del gate. Verificado ausente en el App Service [aud]. Con esto el único pendiente de higiene del ciclo 1 que sobrevive es `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` (Easy Auth), hoy en el Backlog.

**3 · Volcado de la reunión Microsoft ISV Success del 23-jul.** La transcripción oficial llegó después de aquella sesión y se procesó aquí. Lo sustantivo: Microsoft **recomienda fulfillment nativo** (el SaaS Accelerator no conecta con la app), landing y webhook con el mismo login de compra, propuesta de **flat rate + metered billing**, leads vía *Referrals*, y el dato de que **cancelar dentro de 72 h no se factura**. **La credencial federada no llegó a tratarse** (solo se abordaron 2 de las 12 preguntas del brief) → de ahí el brief del 29-jul.

**4 · `ANALISIS-costes-por-sesion.md`** — spike de solo lectura contra producción para no adelantar los ciclos 4 y 5. Resultado: **~$0.024/sesión**, **~70 % STT y 30 % LLM**; un cliente medio cuesta ~$1,30/mes y el más intenso imaginable ~$10/mes → **el metering no se justifica por el coste**, y la palanca real es la elección de modelo del ciclo 4. Su hallazgo estructural es el que ha obligado a enmendar el DESIGN del programa (ver §Enmiendas abajo): **en producción no se mide la duración del audio** (`audio_seconds` NULL al 100 %, `ffprobe` ausente en el App Service) y la **clave de precio está desalineada** (`azure-whisper:whisper` sembrada vs. `azure-whisper:whisper-large-v3` registrada), de modo que el coste de STT se registra como **0**. Confirmado al dato por la auditoría [aud, §4.3] — «el documento más sólido del árbol». *(Nota de fecha: el documento se encabeza «27-jul» pero su commit es `9d8ee4d` del **28-jul 11:09** [git]; o se escribió el 27 y se commiteó a la mañana siguiente, o es otra instancia del arrastre de fechas. No resoluble; sin consecuencia práctica.)*

---

## Sesión C — 28-jul-2026 · **Provisión Azure de SPEC-02 (as-built) + auditoría documental**

| Commit | Hora | Qué |
|---|---|---|
| `9d8ee4d` | 11:09 | Commit del **ANALISIS** (trabajo de la sesión B) |
| `f1bed76` | 11:41 | **ADDENDUM as-built de la provisión Azure** de SPEC-02 §6 + runbook (paso I medio desbloqueado) |
| `6d6ffd7` | 17:22 | **`AUDITORIA-integridad-documental-2026-07-28.md`** (sesión independiente de solo lectura) |
| `28fdea5` | 18:16 | JCC v1.3.1 — reconciliación ampliada en el bloque `CLAUDE.md` |

**Provisión ejecutada antes de implementar**, para que la verificación §8.3/§8.4 no quedara pendiente de ops. **Confirmada punto por punto contra Azure** [aud, §4.1]: app de Entra `speech-to-prompt-fulfillment` (`signInAudience: AzureADMyOrg`), **`passwordCredentials: 0` y `keyCredentials: 0` — secretless real**, FIC `speech-to-prompt-uami` con los 4 campos exactos, UAMI con sus dos GUID distintos (client ID vs principal ID), App Service pasado a `SystemAssigned, UserAssigned` **conservando el `principalId` de sistema** (por eso los RBAC de Blob/AOAI y el usuario contenido de SQL siguen válidos), ambos service principals presentes, App Settings correctos y **sin `AZURE_CLIENT_ID`** (habría alterado `DefaultAzureCredential` globalmente).

**Dos enmiendas al §6 del spec que salieron de ejecutarlo:** (1) el service principal del recurso de Marketplace **ya existía** en el tenant — descartada de antemano la causa habitual de los 403; (2) **falta un paso en el §6.2**: `az ad app create` crea solo el *application object*, así que hay que añadir `az ad sp create --id <appId>` o el flujo client-credentials no emitiría token.

**Regresión §8.4 tras enganchar la UAMI** (el riesgo real del spec): `/api/health/db` **200** (Azure SQL sigue por la MI de sistema — la pieza de mayor riesgo, verde), `/` **200**, `/api/v1/sessions` sin token **401 `UNAUTHENTICATED`**, `/app` → **302** a `/`, y una **destilación real** por Azure OpenAI. **Queda pendiente el smoke de Blob** (ver §Enmiendas).

**Lo que NO se pudo probar y sigue abierto:** el peldaño §8.3 (**intercambio federado**, el corazón del spec). Se intentó vía la API de comandos de Kudu y **no es posible**: el contenedor de Kudu no recibe `IDENTITY_ENDPOINT` y su `node_modules` es un symlink al del contenedor de la app. **El intercambio federado solo se puede probar con código desplegado** → se verificará en el `/jcc-implement` de SPEC-02. Sí se confirmó que los App Settings se heredan y que el runtime es **Node 24.7**.

**La auditoría** (misma fecha, sesión aparte) contrastó todo el árbol documental del programa contra código, producción, BD, Azure y MS Learn: 15 hallazgos, y **cierres contra fuente primaria** de auto-activation, S1–S3 del ciclo 3, S1 del programa y del asunto metering/dimensiones. Es el documento que ha disparado la sesión de saneo del 29-jul.

---

## Enmiendas ejecutadas el 29-jul a raíz de la auditoría

Sesión de saneo documental (sin código). Cada enmienda cita su hallazgo:

- **SPEC-02** — ADDENDUM 2026-07-29: se **retira** la afirmación «no existe reproductor de audio en la UI» (**H-01**, falsa: `Review.tsx:46-91,142` [cód], desplegado en prod [aud]) y el método sustituto **Reprocesar**, que es **inalcanzable** (**H-02**: `canReprocess = has_audio && !has_transcription`, `History.tsx:224` [cód]). El smoke de Blob se cierra **reproduciendo un tramo en Revisión** — sigue **pendiente**, requiere sesión logueada del usuario. Además: `activate 400 = Suspended` añadido al §4.3 (**H-13**), precisión de `@azure/identity` (**H-12**) y fechas 27→28-jul (**H-07**).
- **DESIGN del programa** — ADDENDUM 2026-07-29 (**H-03**): el supuesto «los datos ya existen en `usage_events`» es **cierto para el LLM y falso para el STT**; el ciclo 5 debe **arreglar la medición antes** de construir la superficie.
- **CLAUDE.md** — saneo completo (**H-04**, **H-05**): una sola verdad temporal (cutover hecho, `public/` inexistente, sin editor de system prompt), «Fase actual» reducida a puntero corto, Backlog repoblado con los pendientes durables, y desambiguados **los dos SPEC-02** (ciclo 2 `api-tipada` vs ciclo 3 `fulfillment-secretless`).
- **README del programa / índice global** — provisión Azure ejecutada (**H-05**).
- **DESIGN del ciclo 3** — ADDENDUM 2026-07-29 (**H-08**): auto-activation cerrada contra fuente primaria y **decidida OFF** en mesa común.
- **SPEC-01** — **ADDENDUM 2026-07-29 de despliegue (as-built)**, la enmienda que la auditoría ofrecía como «alternativa mínima» del H-06 y que resultó ser la más sustantiva: documenta la caída de producción del 23-jul, los **dos defectos del §6** y la regla de despliegue que hereda SPEC-02.
- **Referencia al informe de investigación** no persistido → sustituida por la auditoría §3 (**H-09**). Higiene: residuo de tool-call en `SPEC-04` (**H-11**), pitch del BRIEF-23 (**H-10**).

### Decisiones de mesa común del 29-jul

1. **Auto-activation = OFF** para v1. Preserva la decisión [E]1 (match estricto beneficiario↔login **antes** de `activate`), que con ON sería irrealizable, y evita que la facturación arranque en la compra antes de que el cliente consiga entrar. La pregunta queda anotada para el brief de la reunión re-agendada, ya no como duda abierta sino como confirmación operativa.
2. **Override de system prompt: RETIRADO**, no pendiente de recuperación. El moldeado del prompt es lo que diseñará el ciclo 4 (`destilado-destino`); el afinado sigue por git + `seed-prompts`. El parámetro `systemPrompt` de la API sobrevive pero **debe quitarse o gatearse antes del go-live** (Backlog).

---

## Pendientes al 29-jul (estado consolidado)

- **`/jcc-implement` de SPEC-02** — es el siguiente paso del ciclo. Incluye por fin el **§8.3 peldaño 2** (intercambio federado), que solo se puede probar con código desplegado.
- **Smoke de Blob (§8.4 de SPEC-02)** — reproducir un tramo en Revisión, sesión logueada en prod. Es lo único que queda de la regresión de la provisión.
- **Specs 03–06** del ciclo 3. SPEC-03 ya no está bloqueado por auto-activation (decidida OFF) y hereda del §4.3 la distinción de los dos 400.
- **Burocracia (runbook):** tax del **Seller 87879330** *Action required* (W-8BEN-E: artículo del tratado + `Chapter 3 = Corporation` + firma) y **asignación de payout por defecto** vacía. Paso I medio desbloqueado (tenant + app ID ya disponibles); faltan las URLs de landing y webhook.
- **Durables** (ver `### Backlog` de `CLAUDE.md`): modelo de precio, brief de la reunión re-agendada, gateado de `systemPrompt`, secreto residual de Easy Auth.
- **Cross-cutting heredados** (vienen del handoff del 23-jul y siguen vivos): prueba §8.3 del cambio `robustez-coldstart-sql` (cold-start real, coordinar con Agustín); **bump de Node 20→24 en el workflow de despliegue** (`azure-deploy.yml` construye con Node 20 [cód] mientras el runtime es 24.7); retirada del alias sin versión `/api/*` y del redirect `/app`, ya sin consumidores; IP de Agustín en el firewall de SQL/Storage; smoke de `mejorar-destilado-limpio`.

## Nota de método (para no repetirlo)

Tres causas produjeron este hueco, y ninguna es de herramientas:

1. **Evidencia en mensajes de commit.** El deploy de SPEC-01 —un hito con verificación real en producción— quedó registrado en `6691fd2` y en una línea que se sobrescribe. El modelo JCC dice que la historia con evidencia va a los `handoffs/`; **una sesión que despliega a producción necesita bitácora**, aunque no produzca código.
2. **Fechas de memoria.** El ADDENDUM as-built se fechó 27-jul siendo del 28 (**H-07**), segunda reincidencia tras el arrastre 22→23-jul, sobre una regla que ya está escrita: *las fechas salen de `git log` o del sistema, no de memoria*. Cuesta un comando comprobarlo. (Tercer caso menor: la retirada de `ALLOWED_EMAILS` quedó apuntada como del 23-jul cuando fue el **27-jul**, `a6983bd`.)
3. **Un incidente de producción sin postmortem.** La caída del 23-jul se resolvió bien y rápido, pero **no dejó artefacto**: el commit la resumió como «fix del orden migrate+seed» y el SPEC-01 quedó con el §6 defectuoso intacto. Seis días después, ese §6 era la plantilla con la que se iba a desplegar SPEC-02. **Una caída de producción necesita su ADDENDUM en el documento que la causó**, no solo un mensaje de commit — y si además revela que un documento vigente está mal, la corrección va ahí (es exactamente el patrón «corrección sin backport» que la auditoría encontró en el DESIGN del programa, H-03).
