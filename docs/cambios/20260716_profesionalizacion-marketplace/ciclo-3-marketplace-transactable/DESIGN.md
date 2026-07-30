# DESIGN — Ciclo 3 `marketplace-transactable`

**Fecha:** 22-jul-2026 · **Fase JCC:** análisis (este documento la cierra) · **Tipo:** ciclo de un programa multi-ciclo.
**Material previo:** `../DESIGN.md` (DESIGN del programa, §3 troceo · §5 decisiones · §6 preservar) · `../BRIEF-marketplace-agustin.md` (niveles de oferta) · `RUNBOOK-partner-center.md` (estado real del alta) · investigación del Microsoft Marketplace (informe de sesión, fuentes MS Learn 2025-2026 — ⚠️ **ese informe nunca se persistió en el repo**; sus hechos quedaron re-verificados con URL en el **§3 de la [`AUDITORIA-integridad-documental-2026-07-28.md`](../AUDITORIA-integridad-documental-2026-07-28.md)**, que es la referencia citable, H-09) · `ARQUITECTURA.md`.
**Estado del alta (contexto):** cuenta Xenix verificada + enrolada ✅; payout ✅; fiscal a falta de 1 acción (tax del Seller); oferta SaaS `speechtoprompt` en Draft. Detalle vivo en el runbook.

> **Alcance del documento (JCC v1.2):** objetivo, usuarios, alcance/fuera de alcance, decisiones estructurales acordadas, flujos conceptuales, superficie de regresión y riesgos. **No** entra en stack ni detalle de implementación (SQL, endpoints exactos, columnas) — eso es la fase `/jcc-spec`.

---

## 1. Objetivo y problema

**Objetivo:** construir la integración que convierte la app en una **oferta SaaS transactable** de Microsoft Marketplace: activación de suscripciones, recepción de eventos de ciclo de vida, y un **control de acceso por suscripción** que sustituye la lista blanca interina del ciclo 1.

**Problema:** hoy el acceso lo gobierna una **lista blanca de correos** (`ALLOWED_EMAILS`, interina, solo Jesús + Agustín). Para vender el producto por el Marketplace hace falta que el acceso lo determine una **suscripción real** comprada a través de Microsoft, con su alta automática y su ciclo de vida (alta, baja, suspensión, reactivación, cambio de plan). Este ciclo es **el que hace la app publicable**: no requiere que la oferta esté publicada — al revés, produce las URLs (landing + webhook) que el alta de Partner Center pide en su *Technical configuration*. Código y alta avanzan **en paralelo** y convergen en la **compra de prueba en Preview**.

## 2. Usuarios y casos de uso

- **Comprador (profesional individual):** compra la suscripción en el Marketplace → aterriza en nuestra **landing de activación** → inicia sesión con su cuenta Microsoft → queda dado de alta y con acceso. El alta autogestionada **es** el flujo de compra de Microsoft.
- **Usuario de cortesía / tester (acceso manual):** persona a la que Xenix concede acceso **sin pasar por el Marketplace** (un compañero, un amigo que prueba, los propios operadores). Siempre con cuenta Microsoft.
- **Ex-suscriptor:** tras una baja, dispone de una **ventana de retención** para reengancharse conservando sus datos o borrarlos ya.
- **Microsoft (servicio, no persona):** invoca nuestro **webhook** para notificar eventos de ciclo de vida; y nuestro backend llama a las **Fulfillment APIs** para canjear/activar/consultar suscripciones.
- **Operadores (Xenix):** conceden accesos manuales (por SQL en v1; backoffice en el ciclo 6).

## 3. Alcance (v1)

- **Landing de activación**: canjea el token de compra, reconcilia identidad y activa la suscripción.
- **Webhook** público 24/7: recibe y procesa los eventos de ciclo de vida de Microsoft.
- **Integración con las SaaS Fulfillment APIs** (resolve / activate / get / cambios / cancelación), autenticada **sin secretos**.
- **Modelo de acceso unificado ("entitlement")**: una sola noción de "acceso activo" con dos orígenes — **suscripción de Marketplace** y **concesión manual**.
- **Gate por acceso activo**: sustituye la lista blanca `ALLOWED_EMAILS` (que se **retira**); con exenciones para la landing/activación y el webhook.
- **Política de retención de datos en baja/suspensión** (v1-A): bloqueo + ventana fija + borrado a petición + purga automática.
- **App de Entra dedicada** (single-tenant) para el fulfillment, con **credencial federada** (secretless).
- **Resolución del hueco H6** (`users.email NOT NULL`) para que un token de suscriptor sin claim de email no rompa el alta JIT.
- **Configuración de la oferta y su(s) plan(es)** en Partner Center + *Technical configuration* + **prueba de compra en Preview** (se cruza con el `RUNBOOK-partner-center.md`).

## 4. Fuera de alcance (v1)

- **Caso empresa / multi-empleado** y **asignación de la suscripción a otra cuenta** distinta de la de compra (el esquema se deja **preparado**: se guardan comprador y beneficiario por separado).
- **Duración de retención elegible por el usuario**, recordatorios por email y **exportar mis datos** antes del borrado (evolución futura de la política de retención).
- **Cancelación iniciada desde nuestra app** (la baja ocurre en el lado de Microsoft; a lo sumo enlazaremos a su portal de gestión).
- **Metered billing / paquetes de N sesiones** hacia Microsoft.
- **Backoffice** de gestión de suscripciones/concesiones (ciclo 6; en v1 las concesiones manuales se crean por SQL).
- **Selección de modelo destino** (ciclo 4), **costes visibles / fair-use** (ciclo 5).
- **Precio €/mes concreto y estructura fina de planes** (decisión de negocio; ver §9).

## 5. Decisiones acordadas ([E] = estructural, decidida en mesa común)

1. **[E] Reconciliación identidad-comprador = "misma cuenta" (Opción A).** El comprador debe **iniciar sesión con la misma cuenta Microsoft con la que compró**: se casa el **beneficiario** del token de activación con la identidad del login (por `oid`). En caso de **desajuste → bloqueo estricto** con un mensaje que le indica usar la cuenta de compra. **Sin caso multi-cuenta en v1.** El esquema guarda **beneficiario y comprador por separado** para no cerrar la puerta al caso empresa.
2. **[E] Modelo de acceso unificado (una tabla, columna `source`).** El gate pregunta **"¿tiene acceso activo?"**, no "¿tiene suscripción?". Un acceso activo proviene de `source = marketplace` (ciclo de vida gobernado por el webhook/Fulfillment) **o** `source = manual` (concedido por Xenix, sin `subscriptionId` de Marketplace). El webhook solo casa por el `subscriptionId` de Microsoft, así que **nunca** toca las concesiones manuales.
3. **[E] Concesiones manuales de primera clase.** Permiten dar acceso **sin pasar por el Marketplace** (siempre con cuenta Microsoft). **Expiración opcional** (de inicio, indefinidas; el esquema soporta caducidad). **Mismas capacidades** que un acceso de pago (se distinguen solo por `source`, útil para métricas). Se clavan **por email** (pre-login) y se **vinculan al usuario** en el primer login (como hace hoy la lista blanca).
4. **[E] El gate por acceso sustituye y retira `ALLOWED_EMAILS`.** Jesús y Agustín pasan a ser **concesiones manuales** en la BD. Se cierra así el pendiente que la metodología ya tenía marcado.
5. **[E] Fulfillment nativo + app de Entra dedicada single-tenant con credencial federada (secretless).** Se registra una app de Entra **aparte** de la del login de usuarios (Microsoft lo recomienda para el fulfillment); su token contra las Fulfillment APIs se obtiene con **credencial federada / workload identity** enlazada a la Managed Identity del App Service → **sin secretos**. **Plan B:** certificado en Key Vault (si la credencial federada no fuera viable — a confirmar).
6. **[E] Política de retención en baja/suspensión (v1-A).** En `Unsubscribe`/`Suspend` → **se bloquea el acceso** y **se conservan los datos una ventana fija (90 días)**. Durante la ventana, una **pantalla post-baja** ofrece **[Borrar ahora]** y **[Reactivar]**. Pasada la ventana → **borrado automático** (trabajo programado). En `Reinstate` → se restaura. **Futuro:** duración elegible por el usuario, recordatorios, exportar.
7. **Punto y forma del gate.** Se mantiene **donde hoy está la lista blanca** (capa de identidad, tras validar el token; el contrato `req.user` no cambia): cambia el criterio "¿está en la lista?" por "¿tiene acceso activo?". **Exenciones:** landing/activación (un usuario recién logueado aún no tiene suscripción) y webhook (lo llama Microsoft, no un usuario). El resto de app/API, gateado.
8. **Hueco H6 resuelto en este ciclo:** el alta JIT no debe depender de que el token traiga email.
9. **[E] Auto-activation OFF** (añadida el 29-jul; detalle y razones en el **ADDENDUM 2026-07-29**). El flujo de activación es el explícito `resolve`/`activate` del §6, no la activación automática de Microsoft — es la única variante en la que [E]1 (match estricto **antes** de activar) es realizable, y evita facturar a un comprador que aún no ha conseguido entrar.

## 6. Flujos conceptuales (contrato externo, no implementación)

**Activación (landing):** compra en el Marketplace → Microsoft redirige a la **landing** con un **token de compra** (efímero) → si no hay sesión, login Microsoft → **resolve** (canje del token → datos de la suscripción: plan, comprador, beneficiario, estado) → **match estricto** beneficiario ↔ login → **activate** → se crea/enlaza el acceso (`source=marketplace`) al usuario (`owner_id`) → acceso concedido. Desajuste → pantalla de bloqueo con instrucción.

**Ciclo de vida (webhook):** Microsoft invoca el webhook con eventos (`Subscribe`, `Unsubscribe`, `Suspend`, `Reinstate`, `ChangePlan`, `ChangeQuantity`, `Renew`). El backend **valida el JWT entrante**, actualiza el estado del acceso de forma **idempotente** (Microsoft reintenta) y responde con el ACK esperado. El estado del acceso determina el gate.

**Gate:** tras validar el token del usuario, se resuelve "¿acceso activo?" (suscripción `Subscribed` **o** concesión manual vigente). Sí → opera con su aislamiento por `owner_id`. No → según el caso: sin acceso nunca (invitación a suscribirse) o ex-suscriptor en ventana (pantalla post-baja).

**Retención:** baja/suspensión → estado no-activo + marca de fin de ventana → gate bloquea, pero la **pantalla de estado de cuenta** (exenta) permite [Borrar ahora]/[Reactivar]. Purga automática al expirar la ventana.

## 7. Qué se PRESERVA (superficie de regresión) y superficie NUEVA

**Se preserva (no romper):**
- **Validación de token del ciclo 1** (`src/services/token-verify.js`): es la **frontera de seguridad**; el gate se apoya en ella pero **no se toca**.
- **Aislamiento por `owner_id`/`callerId`** (cruzado → 404) y `external_id = tid.oid` como clave de usuario + alta JIT (`ensureUser`).
- **Contrato de sesión**, **salvaguardas de captura R1**, **abstracción de proveedores**, **red privada secretless** (SQL/Blob/AOAI por Managed Identity), migraciones versionadas, pipeline GitHub Actions.
- El gate **cambia su criterio**, no su ubicación ni el contrato `req.user` que consumen las rutas.

**Superficie NUEVA (a diseñar con cuidado de seguridad):**
- **Landing pública** que recibe un **token no confiable** en la query → canje **server-side**; nunca confiar en la query ni exponer el token.
- **Webhook público** llamado por Microsoft → **validar el JWT** (audiencia = nuestra app de fulfillment; emisor/`appid` = recurso de Marketplace; `tid` = nuestro tenant), **idempotencia** y respuesta rápida.
- **App de Entra dedicada** para el fulfillment + **credencial federada**.
- **Trabajo programado** de purga (nueva pieza de infra; debe ser fiable).

## 8. Supuestos y riesgos

- **S1 — credencial federada viable** para obtener el token de las Fulfillment APIs sin secreto. **CONFIRMADO** contra fuente primaria (auditoría §3.2, 28-jul): solo se admiten Managed Identities **asignadas por el usuario** como sujeto de una FIC, app y MI **en el mismo tenant** (nuestro caso), y el bloqueo `AADSTS700236` es **exclusivo de escenarios cross-tenant**. El **plan B (certificado en Key Vault) queda descartado como trabajo** (SPEC-02 §7); se reactivaría solo si el intercambio del §8.3 fallara de forma irrecuperable. *Pendiente: la prueba real del intercambio, que exige código desplegado.*
- **S2 — el token de activación (`resolve`) entrega un beneficiario con `oid`/email utilizable** para el match estricto. **CONFIRMADO por doc, a validar aún contra compra real** (auditoría §3.3): la respuesta trae `subscription.beneficiary.{emailId, objectId, tenantId, puid}` y el token de compra vive **24 h** y llega URL-encoded. Matiz: la doc marca `objectId`/`puid` como *«for informational purposes»* — suficiente para [E]1, pero **la validación definitiva sigue siendo la compra en Preview**.
- **S3 — la gestión/cancelación del cliente vive en el lado de Microsoft y nos llega por webhook.** **CONFIRMADO** (auditoría §3.4): *«The publisher doesn't have to use this API. Direct customers to Microsoft Marketplace to cancel»*; `Unsubscribe` llega por webhook y es *notify-only*. Extra: **no se factura si se cancela dentro de las 72 h** desde la compra. El diseño de retención post-baja (v1-A) es compatible.
- **R1 — match estricto frustra** a quien se loguea con otra cuenta. Mitigación: mensaje claro; reasignación queda para v2.
- **R2 — token de suscriptor sin email** (H6) rompería el alta. Mitigación: resolver el JIT sin depender de email.
- **R3 — certificación transactable prueba la compra e2e** → necesita Preview + tax del Seller resuelto (runbook). Mitigación: resubmisión ilimitada; oferta DEV para ensayar.
- **R4 — webhook: reintentos y orden** de Microsoft → diseño **idempotente** y tolerante a reintentos.
- **R5 — compromiso de datos**: la ventana + purga automática es una promesa de protección de datos → el trabajo de purga debe ser fiable y auditado.
- **R6 — nueva superficie pública** (landing + webhook) amplía el perímetro (hoy cerrado) → endurecer validación de entrada.

## 9. Preguntas abiertas

1. **Precio €/mes y estructura de planes** (¿un plan de pago + *free trial* del Marketplace?, ¿un solo plan?). La oferta tiene esbozados "Basic" y "Trial". Decisión de negocio; no bloquea el diseño del código (el código maneja `planId` genérico). *Nota:* para probar en Preview vale un **private plan a $1**; las pruebas internas se cubren con **concesiones manuales**.
2. **Confirmaciones con Microsoft (reunión 23-jul):** viabilidad de la credencial federada (S1); superficie de gestión/cancelación del cliente (S3); conveniencia de **auto-activation** del plan vs. flujo `resolve`/`activate` explícito. → **CERRADAS todas contra fuente primaria (MS Learn), ver ADDENDUM 2026-07-29.** La reunión del 23 no llegó a tratar ninguna de las tres; la del 29 se canceló y se retoma en ~1 mes, así que se resolvieron por documentación.
3. **¿`free trial` del Marketplace como plan**, además de las concesiones manuales? (relacionado con la estructura de planes; decisión de negocio).

## 10. Posible troceo en specs (guía no vinculante para `/jcc-spec`)

Orden por dependencia (1 es cimiento):
1. **Modelo de acceso + gate**: entitlement unificado (`source` marketplace/manual, expiración opcional), gate por "acceso activo" que **retira `ALLOWED_EMAILS`** y absorbe a Jesús+Agustín, fix H6. *(Fundacional; desbloquea el resto.)*
2. **Cliente de Fulfillment secretless**: app de Entra dedicada + credencial federada + cliente de las Fulfillment APIs (resolve/activate/get/…).
3. **Landing de activación**: token → login → resolve → match estricto → activate → enlace.
4. **Webhook**: eventos + validación de JWT + idempotencia + actualización de estado.
5. **Retención de datos**: bloqueo, ventana 90 d, pantalla post-baja ([Borrar ahora]/[Reactivar]), purga programada.
6. **Oferta + Preview** (operativo, se cruza con el runbook): *Technical configuration*, plan(es), compra de prueba en Preview, iteración hasta certificar.

---

### Nota de cierre (decisiones "en caliente", releer en frío)

- El **gate por suscripción retira la lista blanca** y **unifica** marketplace + concesiones manuales en una sola noción de acceso: mantiene el gate trivial y da la vía para "invitar a probar sin Marketplace".
- **Secretless es un invariante del proyecto**: el fulfillment lo respeta vía credencial federada (con certificado como plan B, nunca un secreto plano).
- La **política de datos** en v1 es fija (90 d + borrar ahora + purga); la agencia total del usuario sobre la duración es evolución.
- La reunión de Microsoft del 23-jul **confirma**, no condiciona: el diseño del código está cerrado y puede arrancar `/jcc-spec` en paralelo al papeleo.

---

## ADDENDUM 2026-07-22 — provisión de no-suscriptores en `users` (de la review de SPEC-01, F-1)

La revisión adversarial de SPEC-01 ([`REVIEW-SPEC-01.md`](REVIEW-SPEC-01.md), F-1, MEDIA) señaló un **cambio de comportamiento** no reconocido en §7: el gate por suscripción exige aprovisionar el usuario (JIT `ensureUser`) **antes** de comprobar el acceso, porque `hasActiveAccess` necesita el `id` interno y la vinculación de concesiones manuales por email ocurre en el primer login. Consecuencia: **cualquier cuenta Microsoft con token válido queda insertada en `dbo.users` aunque reciba 403 sin acceso**. Con la oferta pública del Marketplace, esto permite crecimiento no acotado de la tabla `users`.

- **Estado:** el orden es correcto y **mandado por el SPEC** (SPEC-01 §4.3); no es un defecto. La implementación cumple.
- **Cuándo importa:** solo cuando la oferta sea **pública** (a partir de SPEC-03 / ciclo 7); hoy ningún flujo trae a esos usuarios (acceso solo por concesión manual).
- **Decisión (mesa común):** **se acepta para v1**; la mitigación se decide al abrir la oferta pública. Opciones anotadas: (a) limpieza periódica de `users` sin entitlement asociado; (b) resolver el acceso por `oid`/email **antes** del JIT (no provisionar hasta confirmar acceso o concesión pendiente). No urge y no bloquea el despliegue de SPEC-01.

---

## ADDENDUM 2026-07-29 — auto-activation: cerrada contra fuente primaria y **decidida OFF** ([E]9)

Enmienda 7 del §6 de la [`AUDITORIA-integridad-documental-2026-07-28.md`](../AUDITORIA-integridad-documental-2026-07-28.md) (**H-08**). Cierra la pregunta abierta §9.2 y añade una decisión estructural que el §5 no tenía. Se resuelve por documentación y no por reunión: la del 23-jul no llegó a tratarla y la del 29-jul se **canceló** (se retoma en ~1 mes).

**Qué es, exactamente** (fuentes: [Create plans for a SaaS offer → auto activation](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/create-new-saas-offer-plans) · [Subscription APIs v2](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api) · [Webhook](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-webhook), leídas el 28-jul):

| | Auto-activation **OFF** | Auto-activation **ON** |
|---|---|---|
| Estado tras la compra | `PendingFulfillmentStart` | **`Subscribed` en el momento de la compra** |
| Facturación | empieza al hacer `activate` | **empieza en la compra** |
| `resolve` / `activate` | los llamamos nosotros | **no se llaman nunca** |
| De dónde salen los datos | de la respuesta del `resolve` | del webhook **`Subscribe`** (trae `beneficiary` y `purchaser`) |
| Landing | pieza funcional del flujo | sigue existiendo, pero «account configuration isn't required for billing to start» |

Es un **toggle por plan** en Partner Center.

**Por qué no es una decisión cosmética.** La decisión **[E]1** de este DESIGN (match estricto beneficiario↔login **antes** de `activate`, con bloqueo estricto si no casa) **solo es realizable con OFF**: con ON no hay `activate` que condicionar, y la reconciliación tendría que volverse **post-facto** — crear el entitlement al recibir el `Subscribe` y casarlo en el primer login. Ese mecanismo *existe* (es el mismo binding pre-login por email que SPEC-01 ya tiene en producción, el caso «Agustín `owner_id NULL`»), así que ON no es imposible; es **otro diseño**.

**Decisión (mesa común, 29-jul) — [E]9: auto-activation OFF en v1.** Razones, en orden:

1. **Preserva [E]1 tal como está diseñado y ya especificado**: el match estricto ocurre antes de que empiece a correr el dinero, y el desajuste se le comunica al comprador en el momento en que puede actuar.
2. **No se factura a quien no ha conseguido entrar.** Con ON, un comprador que se atasca en el login (o que compra con una cuenta y usa otra) está pagando desde el primer minuto por algo a lo que no accede → reembolsos y soporte en el peor momento del ciclo de vida, el primer día.
3. **Mantiene el camino estándar y mejor documentado** (`resolve`/`activate`), que es además el que SPEC-02 ya implementa: no hay trabajo tirado.
4. Coste asumido: **SPEC-03 tiene que construir la landing completa** (token → login → resolve → match → activate), que era el plan del §6 de todos modos.

**Consecuencias para SPEC-03/04** (herédalas, no las re-decidas): la landing es **funcional, no informativa**; el webhook `Subscribe` es *notify-only* y no crea accesos por sí solo; el estado inicial esperado tras la compra es `PendingFulfillmentStart` y el camino feliz termina en `activate` → `Subscribed`; hay que tolerar que el comprador **abandone** entre compra y activación (suscripción viva sin entitlement) — **¿cuánto tiempo tolera Microsoft una suscripción sin activar antes de cancelarla? no verificado**, anotado para la reunión re-agendada.

**Lo que se lleva a la reunión re-agendada** ya no es la pregunta original («¿qué es auto-activation?») sino: *«vamos con OFF por control de facturación y por el match estricto de identidad — ¿veis alguna razón operativa para lo contrario en un self-service puro?»* + la caducidad de una suscripción no activada. Actualizar el brief al re-agendar.
