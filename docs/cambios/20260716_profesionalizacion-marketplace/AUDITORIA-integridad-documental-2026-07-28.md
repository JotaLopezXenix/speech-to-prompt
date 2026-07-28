# AUDITORÍA de integridad documental — programa `profesionalizacion-marketplace`

**Fecha:** 28-jul-2026 · **Tipo:** auditoría independiente y adversarial (sesión de solo lectura).
**Objeto:** todo el árbol documental del programa (`docs/cambios/20260716_profesionalizacion-marketplace/`): DESIGN del programa, ciclos 1–3 (DESIGN/SPEC/REVIEW), ANALISIS, RUNBOOK, BRIEFs, handoffs.
**Regla de anclaje aplicada:** ninguna afirmación sobre el estado actual se da por buena sin comprobarla en esta sesión — código del repo (`fichero:línea`), producción (curl), BD de producción (SELECT con identidad Entra del desarrollador, patrón del ANALISIS), Azure (`az` solo lectura) o fuente primaria de Microsoft (URL de MS Learn).
**Límites respetados:** solo lectura. Cero cambios en código, recursos o documentos; los únicos ficheros escritos son este informe y su línea de registro en el README del programa.

---

## 1. Veredicto global

**El árbol documental es sustancialmente veraz en lo estructural y lo verificado con evidencia (código, BD, Azure), pero tiene un patrón sistemático de deriva post-verificación:** lo que se escribe *durante* un ciclo JCC (SPEC→implement→review) resiste el contraste casi perfectamente; lo que se escribe *después* (ADDENDA tardíos, punteros, índices, fechas) acumula errores que nadie backportea. Los dos defectos más graves encontrados están, precisamente, en el documento más reciente (ADDENDUM as-built de SPEC-02, commit de esta misma mañana): una afirmación **falsa** sobre la UI actual (H-01) y un método de verificación **inalcanzable** construido sobre ella (H-02). El caso que motivó esta auditoría (corrección sin backport del supuesto del ciclo 5) se **confirma** (H-03), y aparece un segundo espécimen del mismo género dentro de `CLAUDE.md`, que hoy se contradice a sí mismo (H-04).

En el lado positivo: la provisión Azure de SPEC-02, el gate de SPEC-01 en producción, y el ANALISIS de costes se **confirman al dato exacto** contra Azure, producción y la BD (§4–§5). Los supuestos S1–S3 del ciclo 3, el S1 del programa y los hallazgos de Marketplace quedan **cerrados contra fuente primaria** (§3), incluida la pregunta de auto-activation que bloqueaba el diseño de SPEC-03.

---

## 2. Hallazgos (todos, sin filtrar por importancia)

| # | Gravedad | Tipo | Afirmación | Realidad |
|---|---|---|---|---|
| H-01 | **ALTA** | doc-falsa | ADDENDUM SPEC-02: «no existe reproductor de audio en la UI» | Existe, en Revisión, y está desplegado en prod |
| H-02 | **ALTA** | doc-incompleta (método inválido) | ADDENDUM SPEC-02: verificar Blob con «Reprocesar sobre sesión nueva desechable» | Botón inalcanzable para sesiones con transcripción; 0 candidatas hoy en prod |
| H-03 | **MEDIA** | corrección-sin-backport | DESIGN programa: «los datos ya existen en `usage_events`» | ANALISIS §2 lo demostró falso para STT; sin ADDENDUM |
| H-04 | **MEDIA** | doc-falsa (stale) | CLAUDE.md: `/app` temporal, legacy en `/`, editor de prompt en fase 3 | Cutover hecho; `public/` y el editor no existen; CLAUDE.md se autocontradice |
| H-05 | **MEDIA** | doc-incompleta | README programa: SPEC-02 «pendiente de … provisión Azure» | Provisión ejecutada y verificada (az) |
| H-06 | **MEDIA** | doc-incompleta (evidencia sin artefacto) | «La historia con evidencia va a los handoffs» | 3 sesiones (23/27/28-jul) sin handoff; el deploy de SPEC-01 vive en un mensaje de commit |
| H-07 | BAJA | doc-falsa (fechas) | ADDENDUM SPEC-02: provisión y verificación AOAI «27-jul» | App de Entra creada 28-jul 09:15Z; única destilación post-ventana 28-jul 09:38Z |
| H-08 | BAJA | pregunta-abierta-sin-cerrar | Auto-activation (DESIGN c3 §9.2, BRIEF-29 P8) | Cerrada en esta auditoría contra MS Learn; condiciona [E]1/SPEC-03 |
| H-09 | BAJA | fuente-no-persistida | «Informe de investigación» Marketplace citado por DESIGN c3 y RUNBOOK §3 | No existe como artefacto en el repo |
| H-10 | BAJA | doc-falsa (menor) | BRIEF-23 §1: el usuario «ve el coste de cada operación» | El 23-jul el coste no era visible en ningún frontend |
| H-11 | BAJA | higiene | — | SPEC-04 termina con tags literales `</content>`/`</invoke>` |
| H-12 | BAJA | doc-frágil | SPEC-02 §2: «`@azure/identity` 4.13.1 (ya instalado)» | Cierto por el lock; el manifest declara `^4.5.0` |
| H-13 | INFO | doc-incompleta | SPEC-02 §4.3 (tabla de errores) | Falta `activate` 400 = *Suspended* (doc primaria) |
| H-14 | INFO | consecuencia visible | — | Con 0/32 duraciones medidas, los chips de Revisión muestran siempre «—» |
| H-15 | INFO | no-contrastado | BRIEF-23 §6: «solo se abordaron 2 de las 12 preguntas» | Transcripción no contrastada en esta sesión (plausible) |

### H-01 — ALTA · doc-falsa · el reproductor de audio SÍ existe en la UI
- **Afirmación:** [`SPEC-02_fulfillment-secretless.md:349`](ciclo-3-marketplace-transactable/SPEC-02_fulfillment-secretless.md) (ADDENDUM as-built): «**no existe reproductor de audio en la UI** (el endpoint `GET /sessions/:id/audio/:ordinal` existe en backend y en el cliente tipado, pero **ninguna pantalla lo consume**)».
- **Realidad:** la pantalla Revisión reproduce el audio de cada tramo desde el cutover: `web/src/routes/Review.tsx:46-93` (elemento `Audio`, `togglePlay`) con `api.getSegmentAudio(session.id, ordinal)` en la línea **79**, chips `playable={!!s.audio_file}` en la línea **142**; fachada en `web/src/api/client.ts:126`. Está **desplegado en producción**: el bundle servido hoy en `/` (`/assets/index-fSNESM5h.js`, mismo hash que registró `REVIEW-SPEC-07.md:102`) contiene la ruta `/sessions/{id}/audio` (curl + grep, 28-jul). Es exactamente lo que `SPEC-05 §3.1/§4.3` especificó y lo que `REVIEW-SPEC-05.md` §4.4/e2e verificó («reproducción `GET /audio/1` ✓»). Los 32 segmentos de prod tienen `audio_file` (SQL: `segments.with_audio = 32/32`) → los chips son interactivos y la ruta es alcanzable (Historial → reabrir → Revisión → tocar chip).
- **Consecuencia:** la «corrección del método» del ADDENDUM se apoya en una premisa falsa. La prueba de lectura de Blob más directa y alcanzable es **reproducir un tramo en Revisión** — precisamente lo que el §8.4 original pedía y el ADDENDUM descartó. *(Nota: esta afirmación fue también uno de los motivos declarados de esta auditoría; la evidencia la refuta.)*
- **Confianza:** alta (código + bundle de producción + BD + dos documentos del propio repo).

### H-02 — ALTA · doc-incompleta · el método sustituto (Reprocesar) es inalcanzable
- **Afirmación:** mismo ADDENDUM (`SPEC-02:349`): las pruebas válidas de Blob son «grabar un segmento (escritura) y **Reprocesar** desde Historial (lectura…). Hacerlo sobre una **sesión nueva desechable**».
- **Realidad:** el botón Reprocesar solo se dibuja si `has_audio && !has_transcription` (`web/src/routes/History.tsx:223,250`). Una sesión recién grabada con STT correcto tiene `has_transcription=true` (`session-store.js:141`, derivado de `transcription_raw`) → **el botón no aparece nunca** para una «sesión nueva desechable» normal. Además, si el STT falla en la subida, el segmento no llega a crearse (el `addSegment` de `transcribe.js:108` va *después* de transcribir; el blob subido en `:89` queda huérfano) → tampoco genera candidatas. Comprobado en prod: **cero sesiones** cumplen hoy la condición (SELECT `reprocess_candidates` → 0 filas, 28-jul). Solo un audio mudo (transcripción vacía) haría alcanzable el botón.
- **Consecuencia:** el smoke de Blob que el ADDENDUM deja «pendiente» no puede ejecutarse tal como está prescrito. (La vía real es H-01: reproducir un tramo.)
- **Confianza:** alta.

### H-03 — MEDIA · corrección-sin-backport · el caso que motivó la auditoría, confirmado
- **Afirmación vigente:** [`DESIGN.md` del programa, línea 30](DESIGN.md) (fila del ciclo 5): «los datos **ya existen** en `usage_events`/`model_prices`; falta la superficie»; y línea 66 (§6): «`usage_events` + `model_prices` (**la mitad del control de costes ya hecha**)».
- **Realidad:** el `ANALISIS-costes-por-sesion.md` §2 (27-jul) demostró que es **falso para el STT** (el 70 % del coste): verificado hoy contra la BD de producción — `audio_seconds` NULL en **32/32** eventos STT, `duration_seconds` NULL en **32/32** segmentos, y la clave de precio sembrada es `azure-whisper:whisper` (`migrations/002_usage_and_prices.sql:39`) mientras los eventos registran `azure-whisper:whisper-large-v3` (SELECT sobre `usage_events`), de modo que `estimateCost` (`src/services/pricing.js:29`) no encuentra tarifa y devuelve 0. El ANALISIS §2 lo declara explícitamente («el supuesto del DESIGN del programa es cierto para el LLM y **falso para el STT**») — y **el DESIGN sigue sin ADDENDUM** que remita a esa corrección.
- **Confianza:** alta.

### H-04 — MEDIA · doc-falsa (stale) · CLAUDE.md se contradice a sí mismo
- **Afirmaciones vigentes:** `CLAUDE.md:32` (sección Commands): «Express serves `web/dist` at **`/app`** (ruta temporal de 2b) while `/` keeps serving the legacy `public/` frontend until the final cutover» y «The **legacy** frontend (`public/`) uses native ES modules served directly by Express — changes to `public/` are live on browser refresh». Y `CLAUDE.md:118-137` (sección «Distillation modes + editable system prompt»): «The front can **override the system prompt per distillation** (phase-3 inline editor)… Reopening a session seeds the phase-3 editor… The editor state lives in `app.js` `state`».
- **Realidad:** el cutover de SPEC-07 (22-jul) sirvió `web/dist` en `/` y **borró `public/`** (verificado: `server.js:74-93` — redirect `/app`→`/` + estático en raíz; `public/` no existe; prod `GET /app` → 302 a `/`). El propio `CLAUDE.md:36` (Architecture) lo dice. El **editor de system prompt no existe** en el frontend actual: `grep systemPrompt web/src` → solo `schema.d.ts` (tipos); SPEC-05 §1 lo dejó fuera («no hay editor de system prompt en el front nuevo (sigue en `/` hasta el cutover)») y el cutover retiró ese «`/`». `app.js` fue borrado con `public/`.
- **Consecuencia adicional (sustancia, no solo doc):** desde el 22-jul el **override de system prompt por destilación no es alcanzable desde ninguna UI** (la API lo sigue aceptando) y `/api/prompts` no tiene consumidor. Es una capacidad perdida en el cutover que ningún documento señala como pérdida; queda implícitamente aplazada al ciclo 4.
- **Confianza:** alta.

### H-05 — MEDIA · doc-incompleta · README y «Fase actual» no recogen la provisión ejecutada
- **Afirmación:** [`README.md:29`](README.md) (fila del ciclo 3): SPEC-02 «**pendiente de implementar + provisión Azure**»; `README.md:51`: «*(Especificado; sin implementar.)*» sin mención a la provisión. `CLAUDE.md:8` («Fase actual»): «la **provisión Azure (§6) es prerrequisito**» — sin decir que ya está hecha.
- **Realidad:** la provisión §6.1–6.5 está **ejecutada y verificada** (ADDENDUM as-built + verificación az de esta auditoría, §4.1). El commit que la documenta (`f1bed76`, 28-jul) actualizó SPEC-02 y RUNBOOK pero no el README ni aclaró la línea de CLAUDE.md. «Sin implementar» (el código) sigue siendo cierto: `src/services/fulfillment/` no existe (glob → 0 ficheros), coherente con lo declarado.
- **Confianza:** alta.

### H-06 — MEDIA · doc-incompleta · evidencia fuera de artefactos (handoffs faltantes)
- **Afirmación del modelo:** `CLAUDE.md:11` — «la historia con evidencia va a los `handoffs/` del cambio».
- **Realidad:** el último handoff es `HANDOFF-2026-07-23.md`, que cierra con SPEC-01 «**SIN desplegar**» (línea 9). Desde entonces hubo al menos tres sesiones de trabajo sin bitácora: el **despliegue de SPEC-01** (23-jul tarde — commit `6691fd2`, cuyo título anuncia un «**fix del orden migrate+seed** + Agustín pre-login» que no está explicado en ningún artefacto: SPEC-01 no tiene ADDENDUM de despliegue), la sesión del 27-jul (SPEC-02 + ANALISIS + volcado de la reunión + retirada de `ALLOWED_EMAILS`, commit `a6983bd` que solo tocó CLAUDE.md) y la del 28-jul (provisión as-built). La evidencia del deploy (migración+seed aplicados, smoke) vive hoy en un **mensaje de commit** y en la línea sobrescribible de «Fase actual» (verificado con `git show 6691fd2`). El README (`:5`) delega el estado vivo en esa línea, así que el sistema no colapsa, pero la cadena de evidencia fechada que promete el modelo JCC tiene un hueco de 5 días.
- **Confianza:** alta.

### H-07 — BAJA · doc-falsa (fechas) · la provisión y la verificación AOAI fueron el 28-jul, no el 27-jul
- **Afirmaciones:** `SPEC-02:321,323` («ADDENDUM 2026-07-27 — provisión … se ejecutó el 27-jul»); `SPEC-02:348` («Azure OpenAI → verificado por el usuario (destilación real, **27-jul**)»); `RUNBOOK:72` (fila I «mitad desbloqueada (**27-jul**)»).
- **Realidad:** la app de Entra `speech-to-prompt-fulfillment` se creó el **2026-07-28T09:15:14Z** (`az ad app show --query createdDateTime`), 26 minutos antes del commit `f1bed76` (28-jul 09:41Z). La única destilación posterior al 24-jul en `usage_events` es del **28-jul 09:38:06Z** (evento id 57, sesión 32) — no hay ningún evento LLM el 27-jul. Es el mismo patrón de arrastre de fecha ya documentado para el 22/23-jul (`HANDOFF-2026-07-23.md:5`).
- **Confianza:** alta para las fechas objetivas; el relato («antes de implementar») sigue siendo cierto.

### H-08 — BAJA · pregunta-abierta-sin-cerrar · auto-activation (cerrada en esta auditoría — ver §3.1)
- **Dónde estaba abierta:** `DESIGN` ciclo 3 `:97` (§9.2), `BRIEF-…-29.md:32` (P8), `RUNBOOK:50`.
- **Cierre (fuente primaria):** existe como **toggle por plan** en Partner Center; con auto-activation **ON** la suscripción salta `PendingFulfillmentStart` y pasa a `Subscribed` **en el momento de la compra**, la facturación empieza inmediatamente, `resolve`/`activate` **no se llaman**, y los datos (incl. `beneficiary`) llegan por el webhook `Subscribe`; la landing sigue pudiendo existir pero «account configuration isn't required for billing to start». **Consecuencia de diseño no escrita en ningún documento del ciclo:** la decisión [E]1 (match estricto beneficiario↔login **antes** de `activate`) **solo es realizable con auto-activation OFF**; con ON, la reconciliación pasaría a ser post-facto vía webhook. SPEC-03 no puede especificarse sin fijar este toggle (mesa común / P8 del 29-jul, que pasa de «¿qué es?» a «¿cuál recomendáis para self-service?»).
- **Confianza:** alta (dos páginas de MS Learn actualizadas 2026-07-22, URLs en §3).

### H-09 — BAJA · fuente-no-persistida · el informe de investigación del Marketplace no está en el repo
- **Afirmaciones:** `DESIGN` ciclo 3 `:4` («investigación del Microsoft Marketplace (**informe de sesión**, fuentes MS Learn 2025-2026)»); `RUNBOOK:54` («Fuentes **en el informe de investigación**»).
- **Realidad:** no existe tal artefacto en el repo (glob del programa; la única INVESTIGACION es la de prompt-guides, ciclo 0). Los «hechos confirmados» del RUNBOOK §3 citan una fuente que el lector no puede abrir. Mitigación: esta auditoría re-verificó esos hechos contra MS Learn (§3) y son sustancialmente correctos.
- **Confianza:** alta.

### H-10 — BAJA · doc-falsa (menor) · el pitch atribuye al producto un coste visible que no tiene
- **Afirmación:** `BRIEF-…-23.md:14` (§1, elevator pitch): «Guarda su histórico y **ve el coste de cada operación**».
- **Realidad:** desde el cutover (22-jul) el coste no es visible en ninguna pantalla: Resultado muestra el hueco «Próximamente» (`SPEC-05 §3.3`, código `Result.tsx`), y el frontend legacy que sí lo mostraba fue retirado el día antes de la reunión. (Además, con H-03, el coste que se mostrara subestimaría ~70 %.) Gravedad baja: es un brief de reunión, pero describe el presente con una capability futura.
- **Confianza:** alta.

### H-11 — BAJA · higiene · residuo de tool-call dentro de SPEC-04
- `SPEC-04_captura-salvaguardas.md:366-367` termina con las líneas literales `</content>` y `</invoke>` (verificado con `tail -5 | cat -A`): restos del volcado con el que se escribió el fichero. Sin efecto semántico, pero es contenido espurio en un artefacto normativo.

### H-12 — BAJA · doc-frágil · versión de `@azure/identity`
- `SPEC-02:15` afirma «`@azure/identity` **4.13.1** (ya instalado)». `package.json:21` declara `^4.5.0`; es el **lock** quien resuelve 4.13.1 (`package-lock.json:204`). Hoy es cierto; si se regenerase el lock podría instalarse otra 4.x sin que nadie lo note. Nota menor de precisión (el SPEC depende de `ClientAssertionCredential`, presente en toda la serie 4.x reciente).

### H-13 — INFO · SPEC-02 §4.3 no recoge el 400 de `activate` con suscripción *Suspended*
- La tabla de errores de `SPEC-02:154-163` documenta 400 solo para `resolve` (token) y 404 para `activate` sobre *Unsubscribed*. La doc primaria añade: `activate` → **400** si la suscripción está en estado *Suspended* ([Subscription APIs v2](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api)). Incompletitud menor a heredar por SPEC-03.

### H-14 — INFO · consecuencia visible de H-03 en la UI actual
- Con 0/32 duraciones medidas en prod (SQL), los chips de tramo de Revisión muestran siempre «—» (`Review.tsx:140` + fix BAJA-2 de REVIEW-05). No es un defecto documental; es el síntoma en pantalla del hueco de medición.

### H-15 — INFO · no contrastado en esta sesión
- `BRIEF-…-23.md:86` («de las 12 preguntas del §4 solo se abordaron 2») y demás afirmaciones atribuidas a la transcripción de la reunión (`docs/reuniones/…docx`) no se contrastaron contra el docx en esta sesión. Plausibles y coherentes entre documentos; se anota por transparencia del alcance.

---

## 3. Supuestos y preguntas abiertas, cerrados contra fuente primaria (MS Learn)

Todas las páginas citadas se leyeron el 28-jul-2026; las de Partner Center constan actualizadas a 2026-07-22/23.

### 3.1 Auto-activation (bloqueaba SPEC-03) — CERRADO
Fuentes: [Create plans for a SaaS offer → Configure auto activation](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/create-new-saas-offer-plans) · [Subscription APIs v2](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api) (notas en Resolve/Activate) · [Webhook](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-webhook) (payload de ejemplo «Subscribe (auto-activated subscription)»).
Resumen y consecuencia de diseño: ver H-08. Con ON no hay `resolve`/`activate`, la facturación empieza en la compra y el `Subscribe` webhook trae la suscripción completa (beneficiary/purchaser incluidos). Con OFF se mantiene el flujo del DESIGN ([E]1). **Decisión pendiente de mesa común antes de `/jcc-spec` de SPEC-03.**

### 3.2 S1 ciclo 3 — credencial federada UAMI viable (secretless) — CONFIRMADO
Fuente: [Configure an application to trust a managed identity](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity): «You can only use **User-Assigned** Managed Identities as a credential» (selector del portal); «Both the Microsoft Entra app and managed identity **must belong to the same tenant**»; subject = **principal ID** de la MI, comparación exacta y sensible a mayúsculas; una FIC mal escrita «is created successfully without error» y solo falla en el intercambio — todo tal y como lo describe `SPEC-02 §2.2-2.3`. El error **AADSTS700236** aparece en escenarios **cross-tenant** («tokens issued by issuer … may not be used for federated identity credential flows for applications … registered in **this** tenant» — [MS Q&A](https://learn.microsoft.com/en-us/answers/questions/2139753/aadsts700236-entra-id-tokens-issued-by-issuer-http), [Entra blog GA](https://devblogs.microsoft.com/identity/access-cloud-resources-across-tenants-without-secrets-ga/)); el caso Xenix es same-tenant (verificado en §4.1). **La afirmación de SPEC-02/BRIEF-23 §6 es correcta.**

### 3.3 S2 — el `resolve` entrega beneficiario utilizable — CONFIRMADO (con matiz)
Fuente: [Subscription APIs v2 → Resolve](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api): la respuesta incluye `subscription.beneficiary.{emailId, objectId, tenantId, puid}` y `purchaser.{…}`; el token de compra **vive 24 h** y llega URL-encoded (hay que decodificarlo) — coincide con `SPEC-02 §4.3/§4.5`. Matiz: la doc marca `objectId`/`puid` como «for informational purposes» — suficiente para el match estricto de [E]1, pero conviene validar contra compra real en Preview (como ya prevé el DESIGN).

### 3.4 S3 — la cancelación vive en el lado de Microsoft — CONFIRMADO
Fuente: ídem, sección *Cancel a subscription*: «The publisher **doesn't have to** use this API. **Direct customers to Microsoft Marketplace to cancel** SaaS subscriptions»; `Unsubscribe` llega por webhook y es *notify-only*. Además: «The customer **isn't billed** if a subscription is canceled **within 72 hours** from purchase» — confirma el dato suelto de Marcelo (RUNBOOK bitácora 23-jul). El diseño de retención post-baja (v1-A) es compatible.

### 3.5 Metering / dimensiones / modelo de precio — CERRADO (responde de facto a P1-P2 del brief del 29)
Fuente: [Metered billing for SaaS offers](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/saas-metered-billing) + [Create plans…](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/create-new-saas-offer-plans):
- **«Metering exige flat rate»: CONFIRMADO** — «Marketplace metering service is available **only to the flat rate** billing model and doesn't apply to the per user billing model». Las dimensiones son «an optional extension to the flat rate pricing model».
- **«Dimensiones congeladas al publicar»: CONFIRMADO, con matiz decisivo** — tras publicar, ID/Display Name/Unit of Measure (nivel oferta) y precio/cantidades incluidas/enabled (nivel plan) **no se pueden editar**; PERO la doc declara **explícitamente soportado**: «You can publish a **flat-rate plan without any dimensions**, then **add a new plan and configure a new dimension** for that plan». Es decir: **empezar con tarifa plana simple y añadir metering después es posible sin recertificar el modelo**, siempre que la oferta nazca flat-rate.
- **Lo verdaderamente irreversible:** el **pricing model de la oferta** (flat rate vs per-user) — «After your offer is published, **you can't change the pricing model**» — y el sell-through-Microsoft. Elegir per-user cerraría la puerta al metering para siempre.
- Con el dato de coste del ANALISIS (~$0.024/sesión), la hipótesis «tarifa plana + fair-use, metering después si hace falta» queda **respaldada por la doc**: la pregunta A1 del brief del 29 ya tiene respuesta documental; a Microsoft solo cabe pedirle confirmación operativa.

### 3.6 S1 del programa — facturación de Claude (CCU) — CONFIRMADO
Fuentes (las dos URLs citadas por el DESIGN existen y dicen lo citado): [Claude consumption units (CCU) billing](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models-billing) — CCU es consumo de **Azure Marketplace**, **MACC-eligible**, pay-as-you-go sin créditos prepagados; [Models from partners → Anthropic](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-from-partners) — «The following subscription types are currently not supported: … **Sponsored subscriptions that only use Azure credits**. *Note: If you have an account with a credit card on file, **the credit card will be charged instead of Azure Credits***». La cita del DESIGN §7 es textual. El fallback (GPT como destilador v1) sigue bien fundado.

### 3.7 Extras cerrados de paso (alimentan el brief del 29)
- **P10 (reintentos webhook):** «Microsoft does have a retry policy for the webhook call (**500 retries over eight hours**)» ([Webhook](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-webhook)). El **orden no se garantiza** en ningún punto de la doc (silencio → diseñar idempotente, como ya está decidido). Respuesta esperada: HTTP 200 como ACK; para `ChangePlan`/`ChangeQuantity`, PATCH con success/failure en ~10 s (si no, auto-aceptado). Obligatorio validar el JWT entrante — claims exactamente como dice `RUNBOOK:51`: `aud` = app ID de la Technical configuration, `appid` **o** `azp` = `20e940b3-…`, `tid` = tenant del publisher.
- **P12 (compra de prueba):** además del 72 h sin factura, la doc de testing recomienda plan a $0, o precio simbólico cancelando «within 24 hours»; ojo: «**You are still required to pay the invoices for test purchases**. If a purchase is canceled within 72 hours your refund will be credited in next month's invoice» ([Create plans…](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/create-new-saas-offer-plans)) — el reembolso es en la factura siguiente, no una no-facturación inmediata en todos los casos.

---

## 4. Confirmar o refutar lo dado por verificado (T5)

### 4.1 Provisión Azure de SPEC-02 (ADDENDUM as-built) — **CONFIRMADA punto por punto** (az, 28-jul)
| Afirmación del ADDENDUM | Verificación |
|---|---|
| App `speech-to-prompt-fulfillment`, client `a29c76de-…`, object `56f0fa6f-…`, single-tenant | `az ad app show`: appId/objectId exactos, `signInAudience: AzureADMyOrg` ✔ |
| Sin secreto ni certificado (`passwordCredentials: 0`, `keyCredentials: 0`) | `passwords: 0, certs: 0` ✔ (secretless real) |
| FIC `speech-to-prompt-uami` (id `9fd18f7d-…`), issuer `…/3b1870f6-…/v2.0`, subject = principalId UAMI, audience `api://AzureADTokenExchange` | `az ad app federated-credential list`: los 4 campos exactos ✔ |
| UAMI clientId `8fab969a-…` / principalId `1a63ee6b-…` | `az identity show`: exactos ✔ |
| App Service `SystemAssigned, UserAssigned` conservando principal de sistema `2990520e-…` | `az webapp identity show`: exacto ✔ |
| SP del recurso Marketplace ya existente (Enmienda 1) | `az ad sp show 20e940b3-…` → «MarketplaceAPI ISV» ✔ |
| SP de la propia app creado (Enmienda 2) | `az ad sp show a29c76de-…` → objectId `f5002b4a-…` ✔ |
| App Settings `MARKETPLACE_{TENANT_ID,APP_CLIENT_ID,MI_CLIENT_ID}`; sin `AZURE_CLIENT_ID`; sin `ALLOWED_EMAILS`; persiste `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` (deuda) | `az webapp config appsettings list --query [].name`: todo ✔ |
| Regresión: `/api/health/db` 200 · `/` 200 · `/api/v1/sessions` sin token 401 `UNAUTHENTICATED` | curl 28-jul: 200 / 200 / 401 ✔ (+ `/app` → 302 `/`) |

**Salvedades:** las fechas (H-07), el punto de Blob del propio ADDENDUM (H-01/H-02), y que la verificación AOAI fue esta mañana, no el 27 (SQL). El peldaño §8.3 (intercambio federado) sigue **sin probar** — el propio ADDENDUM lo reconoce honestamente (solo posible con código desplegado; Kudu sin `IDENTITY_ENDPOINT`).

### 4.2 SPEC-01 (gate) desplegado y verificado — **CONFIRMADO**
Migración `007_entitlements.sql` aplicada en prod el 23-jul 16:40:35Z (`schema_migrations`); `entitlements` = exactamente 2 filas manuales activas — Jesús `owner_id=1` (16:41Z) y Agustín **pre-login** `owner_id=NULL` (17:10Z), notas de cutover — tal como declara la «Fase actual» que escribió `6691fd2`; `users.email` ya admite NULL (H6 ✔); gate en `identity.js:57-59` (`bind → hasActiveAccess → 403 NO_ACCESS`) idéntico al SPEC; `allowlist.js`/su test inexistentes; OpenAPI/`schema.d.ts` dicen `NO_ACCESS` (`openapi/speech-to-prompt.yaml:524`); `ALLOWED_EMAILS` fuera de App Settings; `npm test` **16/16** hoy. El smoke post-deploy existe de verdad: evento STT en prod a las 16:51:14Z del 23-jul (11 min tras la migración) + destilado del 24-jul.

### 4.3 ANALISIS de costes — **CONFIRMADO al dato** (SQL, 28-jul)
Ventana 25-jun→24-jul: **31 sesiones** ✔ · **28 con uso** ✔ · **55 eventos** (24 LLM + 31 STT) ✔ · tokens **53.193 in / 12.333 out** ✔ (con las tarifas sembradas, LLM = $0,2051 ✔) · sesión 23 = **15.941** chars ✔ · `audio_seconds` NULL 100 % ✔ · duraciones de segmentos NULL 100 % ✔ · clave de precio `azure-whisper:whisper` vs eventos `whisper-large-v3` ✔ (sigue sin corregir, como el propio ANALISIS decidió) · 1 solo usuario en `users` ✔. La estimación STT por proxy y las proyecciones son extrapolaciones declaradas como tales — sin nada que objetar. **Es el documento más sólido del árbol.**

### 4.4 Hallazgos de Marketplace — ver §3.2 y §3.5 (los tres confirmados; «dimensiones congeladas» con el matiz de §3.5, que además es la respuesta que se iba a preguntar el 29-jul). Nota: «metering exige flat rate» y «dimensiones congeladas» **no constan como afirmación citable en ningún documento del repo** — vivían en el informe de investigación no persistido (H-09); quedan ahora anclados aquí con URL.

---

## 5. Lo que queda CONFIRMADO como fiable (contrastado en esta sesión)

- **Ciclo 3 SPEC-01 completo** (código=spec, BD, deploy, settings, tests) — §4.2.
- **Provisión as-built de SPEC-02** (menos fechas y el punto Blob) — §4.1. El código de SPEC-02 correctamente declarado como no implementado.
- **ANALISIS-costes-por-sesion.md** íntegro — §4.3.
- **REVIEWs 05/06/07 del ciclo 2**: todo lo re-muestreado coincide (hash del bundle en prod, fix del redirect `/app` en `server.js:79-85` tal como describe el cierre de bucle de REVIEW-07, fixes BAJA-1/2 en `Review.tsx:41,99`, condición de Reprocesar, ficheros de `capture/`/`auth/`/`session/` presentes, `vite.config.ts` con `base:'/'` y PWA a `/`).
- **Ciclo 1**: `token-verify.js` con issuer v2.0 + `assertScope` (`:44,68`), migración 006 aplicada (BD), gate montado en `server.js` sobre `/api/*` y `/api/v1/*`.
- **Supuestos S1-S3 del ciclo 3, S1 del programa, y los 3 hallazgos de Marketplace** — §3, con URLs vigentes.
- **Producción hoy**: `/` sirve la SPA nueva, salud de BD OK, API gateada, redirect transitorio activo.

---

## 6. Enmiendas propuestas (priorizadas — NO ejecutadas; mesa común)

1. **SPEC-02 ADDENDUM (H-01/H-02):** corregir la nota de método — el smoke de lectura de Blob es «reproducir un tramo en Revisión» (existente y alcanzable); retirar la afirmación «no existe reproductor»; re-ejecutar ese smoke y cerrar el §8.4.
2. **DESIGN del programa (H-03):** ADDENDUM en la fila del ciclo 5 y en §6 remitiendo al ANALISIS §2 («cierto para LLM, falso para STT; el ciclo 5 debe arreglar la medición primero»).
3. **CLAUDE.md (H-04):** reescribir el párrafo de Commands (cutover hecho: `/` sirve `web/dist`, `public/` retirado) y la sección Distillation (el editor de system prompt no existe en la UI actual; el override sobrevive solo como parámetro de API; decidir en el ciclo 4 si se recupera). Aclarar en «Fase actual» que la provisión §6 está ejecutada (H-05).
4. **Handoff de recuperación (H-06):** una bitácora que cubra 23-jul tarde (deploy SPEC-01 + qué fue el «fix del orden migrate+seed»), 27-jul y 28-jul (provisión), con su evidencia. Alternativa mínima: ADDENDUM de despliegue en SPEC-01.
5. **README del programa (H-05):** fila ciclo 3 y bullet SPEC-02 → «provisión Azure ejecutada (28-jul); código sin implementar».
6. **Fechas (H-07):** corregir 27→28-jul en el ADDENDUM de SPEC-02 y RUNBOOK fila I (o anotar la deriva). Considerar una regla operativa: fechar con `git log`, no de memoria — es la 2ª vez.
7. **DESIGN ciclo 3 §9 (H-08):** volcar el cierre de auto-activation (§3.1) y convertir la pregunta en decisión ON/OFF para SPEC-03; actualizar P8 y A1-A2 del brief del 29 con lo ya respondido por la doc (§3.5) para gastar la reunión en lo que la doc no responde (P7 de Technical configuration en borrador, S2 en Preview, recomendación operativa).
8. **Persistir la investigación Marketplace (H-09):** o bien dar por sustituida la referencia por el §3 de este informe.
9. **Higiene:** limpiar `SPEC-04:366-367` (H-11); añadir `activate 400=Suspended` al §4.3 de SPEC-02 (H-13); opcionalmente fijar `@azure/identity` o anotar la dependencia de versión (H-12); revisar el pitch del BRIEF si se reutiliza (H-10).

---

## 7. Apéndice — método y evidencia

- **Código:** lectura directa de `server.js`, `src/middleware/identity.js`, `src/services/{entitlement-store,db,pricing,session-store}.js`, `src/routes/transcribe.js`, `src/services/token-verify.js` (grep), `web/src/routes/{Review,History}.tsx`, `web/src/api/client.ts`, `web/vite.config.ts`, migraciones 002/003/007, globs de existencia (`fulfillment/` ∅, `allowlist.js` ∅, `capture|auth|session/*` ✔). `npm test` ejecutado: 16/16.
- **Producción:** curl de solo lectura a `https://speech-to-prompt-xenix-….azurewebsites.net` (`/`, `/api/v1/health/db`, `/api/v1/sessions`, `/app`, bundle `/assets/index-fSNESM5h.js`).
- **BD de producción:** SELECTs vía `mssql` + `azure-active-directory-default` (identidad Entra del desarrollador, mismo patrón que el ANALISIS): `schema_migrations`, `entitlements`, `users`, `usage_events` (agregados, por modelo, ventana, post-24-jul), `model_prices`, `segments`, `sessions`, candidatas a Reprocesar. Cero escrituras.
- **Azure:** `az account show`, `az identity show`, `az webapp identity show`, `az ad app show` (+`createdDateTime`), `az ad app federated-credential list`, `az ad sp show` (x2), `az webapp config appsettings list --query "[].name"` (solo nombres; ningún valor de setting se leyó ni se transcribió).
- **Fuentes primarias:** MS Learn (Subscription APIs v2, Webhook, Create plans/auto-activation, Metered billing, Workload identity federation/FIC, CCU billing, Models from partners), MS Q&A y Entra blog para AADSTS700236 — URLs en §3.
- **git:** `git log`, `git show --stat` y `git show` de `6691fd2`, `a6983bd`, `f1bed76`.
