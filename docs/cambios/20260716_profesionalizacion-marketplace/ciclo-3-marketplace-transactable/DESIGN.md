# DESIGN — Ciclo 3 `marketplace-transactable`

**Fecha:** 22-jul-2026 · **Fase JCC:** análisis (este documento la cierra) · **Tipo:** ciclo de un programa multi-ciclo.
**Material previo:** `../DESIGN.md` (DESIGN del programa, §3 troceo · §5 decisiones · §6 preservar) · `../BRIEF-marketplace-agustin.md` (niveles de oferta) · `RUNBOOK-partner-center.md` (estado real del alta) · investigación del Microsoft Marketplace (informe de sesión, fuentes MS Learn 2025-2026) · `ARQUITECTURA.md`.
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

- **S1 — credencial federada viable** para obtener el token de las Fulfillment APIs sin secreto. *A confirmar (reunión MS / prueba).* Mitigación: plan B certificado en Key Vault.
- **S2 — el token de activación (`resolve`) entrega un beneficiario con `oid`/email utilizable** para el match estricto. *A validar en Preview.*
- **S3 — la gestión/cancelación del cliente vive en el lado de Microsoft y nos llega por webhook.** *Confirmar la superficie exacta con MS.* Condiciona que el diálogo de retención sea **post-baja/preferencia**, no en el instante de cancelar.
- **R1 — match estricto frustra** a quien se loguea con otra cuenta. Mitigación: mensaje claro; reasignación queda para v2.
- **R2 — token de suscriptor sin email** (H6) rompería el alta. Mitigación: resolver el JIT sin depender de email.
- **R3 — certificación transactable prueba la compra e2e** → necesita Preview + tax del Seller resuelto (runbook). Mitigación: resubmisión ilimitada; oferta DEV para ensayar.
- **R4 — webhook: reintentos y orden** de Microsoft → diseño **idempotente** y tolerante a reintentos.
- **R5 — compromiso de datos**: la ventana + purga automática es una promesa de protección de datos → el trabajo de purga debe ser fiable y auditado.
- **R6 — nueva superficie pública** (landing + webhook) amplía el perímetro (hoy cerrado) → endurecer validación de entrada.

## 9. Preguntas abiertas

1. **Precio €/mes y estructura de planes** (¿un plan de pago + *free trial* del Marketplace?, ¿un solo plan?). La oferta tiene esbozados "Basic" y "Trial". Decisión de negocio; no bloquea el diseño del código (el código maneja `planId` genérico). *Nota:* para probar en Preview vale un **private plan a $1**; las pruebas internas se cubren con **concesiones manuales**.
2. **Confirmaciones con Microsoft (reunión 23-jul):** viabilidad de la credencial federada (S1); superficie de gestión/cancelación del cliente (S3); conveniencia de **auto-activation** del plan vs. flujo `resolve`/`activate` explícito.
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
