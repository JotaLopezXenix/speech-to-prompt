# RUNBOOK — Alta de "Speech to prompt" como oferta SaaS transactable (Microsoft Marketplace / Partner Center)

> **Qué es este documento.** Track **burocrático** del ciclo 3, paralelo al DESIGN del código. Checklist vivo del alta en Partner Center: lo vamos rellenando con capturas y dudas, y anotamos **dónde nos bloqueamos** y **qué esperamos** cuando hay que parar. No es un artefacto JCC formal (el DESIGN/SPEC del código van aparte); es la bitácora operativa del papeleo.
>
> **Regla de seguridad (no negociable):** los formularios **fiscales y bancarios** (W-8/W-9, cuenta de payout) los rellena **el usuario**; Claude **guía** pero **no introduce** datos fiscales/bancarios ni credenciales.

**Marca/portal (confirmado, 2026):** el marketplace es hoy **"Microsoft Marketplace"** (fusión de Azure Marketplace + AppSource, rebrand sep-2025), pero se **gestiona en Partner Center** → tile *Marketplace offers* → pestaña *Commercial marketplace*. Nuestra oferta = **Software as a Service**, opción **"Sell through Microsoft" (transactable)**, plan **flat mensual** (sin metered).

---

## 1. Estado actual (snapshot 22-jul-2026, de las capturas del usuario)

**Cuenta de Partner Center (Xenix):** existe y está **enrolada en el commercial marketplace**. Jesús y Agustín tienen acceso. Hay **2 ofertas**:

| Oferta (alias) | Offer ID | Tipo | Últ. mod. | Estado |
|---|---|---|---|---|
| **Speech to prompt by xenix** | `speechtoprompt` | **Software as a Service** | 17-jul-2026 | **Draft** (empezada ayer, sin terminar) |
| move2cloud | `move2cloud` | Professional service | 22-may-2024 | **Attention needed** (de Agustín, antigua) |

**move2cloud** (captura 2): oferta *Professional service* de 2024 que **falló la certificación** (*Manual validation < 2 business days* ✗, 23-may-2024) y quedó abandonada. **Nunca llegó a Go live.** Co-sell "In Market"; MACC "Not eligible". → **No es transactable; no aporta perfil fiscal/payout.** La oferta homónima que se ve en el Marketplace público es **de otro proveedor**, no esta.

**Speech to prompt by xenix** (captura 3): oferta SaaS en **Draft**, 5 pasos de publicación **sin empezar** (Automated validation → Preview creation → Publisher signoff → Certification → Publish). Ya tiene **2 planes** esbozados, ambos Draft:
- **Basic** (`stpbasic`) — Pricing: *Not set* · Availability: *Not set*
- **Trial** (`stptrial`) — Pricing: **Flat rate** · Availability: **Public**

**Dato confirmado por la UI de MS:** la **certificación manual es "< 2 business days"** (mejora el "3-5 días" que era inferencia).

---

## 2. Lectura del estado → qué implica para el plan

- ✅ **Cuenta verificada + enrolamiento en el programa: HECHO** (por tener ofertas ya creadas). Nos ahorramos esa latencia.
- ✅ **La oferta SaaS ya está scaffolded** (existe el borrador + Offer ID + 2 planes). No partimos de cero en Partner Center.
- ✅ **Perfil de PAYOUT: HECHO.** Dos payment profiles *Complete* (CaixaBank, cuenta ...5391): `MPNIncentives` y `XENIX SOLUTIONS`. La parte bancaria (la más lenta) ya está.
- 🟡 **Perfil FISCAL: casi hecho, 1 pendiente clave.** Dos tax profiles:
  - *Spain · MPN 6541588 · XENIX SOLUTIONS S.L.* → **✅ Complete** (fiscal de la relación MPN/incentivos).
  - *Spain · **Seller 87879330*** → **⚠️ Action required** (expira 31/12/2027). **Este Seller ID es la cuenta de vendedor del marketplace comercial → es la que importa para transactar.** Hay que **resolver esa acción**. NO es dar de alta desde cero → se elimina el grueso de la latencia crítica.
- ⏳ **Technical configuration** (Landing URL + Webhook URL + Entra tenant/app ID) → depende del **código del ciclo 3**. Se puede dejar para después del marketing; obligatoria para publicar en Preview.
- ❓ **Asignación de perfiles al programa Marketplace comercial** (payout + tax por programa/location) → **verificar** (que los perfiles *Complete* estén asignados al Commercial Marketplace, no solo a MPN Incentives).

**IDs de referencia:** Seller ID (marketplace) = **87879330** · MPN = **6541588** · razón social = **XENIX SOLUTIONS S.L.** (Spain). Rol de Jesús: **Account admin** (+ partner/co-sell/support/incentive admin); **NO** consta Global admin ni roles marketplace *Owner/Financial Contributor* (verificar si bloquean la edición fiscal/payout).

---

## 3. Hechos confirmados del proceso (de la investigación, condensado)

- **Requisitos de cuenta para transactable:** cuenta verificada + enrolada (✅), **tax profile** y **payout profile** (❓, **solo se exigen en transactable**, nivel cuenta/Seller ID, validación ≤48 h c/u, **tax ANTES que payout**, roles **Owner/Financial Contributor**, formularios US **W-8/W-9**).
- **Technical configuration = 4 campos obligatorios** (para publicar, no para el borrador): **Landing page URL**, **Connection webhook URL**, **Entra tenant ID**, **Entra application ID**. Se puede guardar borrador vacío y adelantar marketing; deben **funcionar** para la compra de prueba en Preview.
- **App de Entra para el FULFILLMENT ≠ login de usuarios.** Microsoft recomienda **app dedicada single-tenant** con client-credentials (scope `20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default`, endpoint v2, api-version `2018-08-31`). ⚠️ Tensión con nuestro invariante *secretless* → decisión estructural en el DESIGN del código (credencial federada/cert vs. secret).
- **Flujo de activación:** compra → redirect a **landing** con `?token=…` (URL-encoded, caduca 24 h) → `POST /subscriptions/resolve` (header `x-ms-marketplace-token`) → `POST /subscriptions/{id}/activate` → estado `Subscribed` (empieza facturación). Opción *auto-activation* (Microsoft activa y manda webhook `Subscribe` directamente).
- **Webhook:** eventos `Subscribe / Unsubscribe / ChangePlan / ChangeQuantity / Suspend / Reinstate / Renew`; responder 200 (ACK) y **validar el JWT** entrante (`aud`=nuestro app ID, `appid/azp`=`20e940b3-…`, `tid`=nuestro tenant) llamando a Get Operation antes de actuar. Microsoft reintenta.
- **Prueba en Preview:** *Preview audience* → comprar la propia oferta; para no incurrir en coste: **private plan a $1**, o **cancelar en 72 h**, o **ticket** a Microsoft. **Reenvíos ilimitados** hasta certificar. Recomendado usar **oferta DEV** aparte para experimentar (no pulsar Go live en la DEV).

Fuentes en el informe de investigación (Microsoft Learn, artículos 2025-2026).

---

## 4. Checklist maestro (orden de ataque)

| # | Paso | Depende de | Estado |
|---|---|---|---|
| A | Cuenta verificada + enrolada en commercial marketplace | — | ✅ hecho |
| B | **Perfil fiscal (tax)** a nivel cuenta | rol Owner/Financial Contributor | 🟡 MPN ✅; **Seller 87879330 = Action required → EN CURSO**: rellenando **W-8BEN-E** (determinaciones campo a campo en la bitácora 23-jul). **Pendiente:** artículo/tipo del tratado España–EE. UU. (asesor/Microsoft) + **confirmar `Chapter 3 = Corporation`** (⚠️ NO *Partnership/Asociación*) + firma. |
| B2 | **Asignación** de payout+tax al programa Commercial Marketplace | B, C | 🟡 **"Manage default payment profiles" = vacío** ("No values returned") → falta asignar payout por defecto/por programa aunque los perfiles existan |
| C | **Perfil de payout** a nivel cuenta | B (tax primero) | ✅ hecho (2 payment profiles Complete) |
| D | Offer setup: confirmar **"Sell through Microsoft" (transactable)** | — | ❓ verificar en la oferta |
| E | Properties (categorías, contrato legal) | — | ⬜ pendiente |
| F | Offer listing (marketing: nombre, descripción, logos, capturas, vídeo, getting-started) | nombre comercial + assets | ⬜ pendiente |
| G | **Plans & pricing** (definir Basic/Trial, precio €/mes flat, mercados, visibilidad) | decisión de negocio (precio) | 🟡 esbozado (2 planes draft). ⚠️ **Modelo sin cerrar**: a Microsoft se le dijo *pay-as-you-go*; su propuesta es **flat rate + metered billing** (dimensiones de consumo reportadas por API) — choca con el `DESIGN.md` §4 del ciclo, que deja el metering fuera de v1. **Primera pregunta del 29-jul** |
| G2 | **Leads** (Referrals): conectar a CRM externo / webhook / Azure Table desde *Offer setup* | D | ⬜ pendiente (opcional v1; Marcelo lo señaló el 23-jul) |
| H | Preview audience | — | ⬜ pendiente |
| I | **Technical configuration** (Landing URL + Webhook URL + Entra tenant/app ID) | **código ciclo 3** | 🟡 **mitad desbloqueada (27-jul)**: los dos campos de Entra ya se pueden rellenar → **Tenant ID `3b1870f6-ff96-440e-9d46-a3db343eae1c`** · **App ID `a29c76de-8827-4f6a-97e0-7d94e058601b`** (app `speech-to-prompt-fulfillment`, provisionada en SPEC-02). Landing URL y Webhook URL siguen esperando a SPEC-03/04. **Hasta grabar estos campos, las Fulfillment APIs devuelven 401/403 por diseño** |
| J | Publicar en Preview + **compra de prueba e2e** | I + G + (B,C para Go live) | ⬜ hito de convergencia |
| K | Certificación (manual < 2 días hábiles) | J | ⬜ pendiente |
| L | Go live | K + B + C | ⬜ pendiente |

---

## 5. Bloqueos / a la espera

- **[en curso] Tax profile del Seller 87879330 = "Action required".** Se está rellenando el **W-8BEN-E** (ver determinaciones en la bitácora 23-jul). **Bloqueos/pendientes:** (1) el **artículo y tipo de renta del tratado** España–EE. UU. + el % de retención → confirmar con asesor fiscal o en la reunión de MS; (2) **`Chapter 3 = Corporation`** (⚠️ que NO quede como *Partnership/Asociación* — una S.L. tributa por defecto como corporation a efectos US); (3) firma electrónica del formulario.
- **[abierto] Asignación de payout por defecto vacía** ("Manage default payment profiles" sin valores) → asignar el payout profile al programa/por defecto para que la oferta pueda cobrar.
- **[abierto, 27-jul] Modelo de precio sin cerrar** → bloquea el paso **G** (Plans & pricing) y condiciona SPEC-03/06 del código. A Microsoft se le comunicó *pay-as-you-go*; el `DESIGN.md` §4 del ciclo deja el metered billing fuera de v1. **Decisión de negocio (Agustín + Jesús), a informar con lo que respondan el 29-jul** (preguntas A1–A4 del brief del 29).
- **[decisión 22-jul] No se continúa hoy** con la config del Marketplace. La preocupación principal (burocracia) queda **bien encaminada**: cuenta ✅, payout ✅, fiscal casi ✅ (1 acción), oferta en borrador. Se retoma tras la reunión de Microsoft.

---

## 6. Dudas abiertas (para Microsoft o para decidir)

- **[fiscal] Tratado España–EE. UU. en el W-8BEN-E:** ¿qué **artículo** y **tipo de renta** aplica a los pagos del Marketplace (¿beneficios empresariales 0% sin establecimiento permanente, o cánones/royalties con tipo reducido?) y qué **% de retención**? → asesor fiscal o Microsoft.
- **[fiscal] Confirmar `Chapter 3 = Corporation`** para una S.L. (por defecto sí; salvo elección Form 8832 improbable).

---

## 7. Bitácora

- **22-jul-2026** — Sesión de diseño del ciclo 3. Creado este runbook. Estado inicial mapeado desde capturas. Siguiente acción: **verificar estado de perfil fiscal + payout** (checkpoint B/C, ruta crítica).
- **22-jul-2026 (cont.)** — Verificado Payout and tax: **payout ✅ (2 payment profiles CaixaBank Complete)**; **tax: MPN ✅, pero Seller 87879330 = ⚠️ Action required** (expira 31/12/2027). La latencia crítica de "alta desde cero" se elimina; queda **resolver la acción del tax del Seller** + **verificar asignación de perfiles al programa Marketplace**. Rol de Jesús = Account admin (verificar si basta para editar fiscal/payout).
- **22-jul-2026 (cont. 2)** — Abierto el wizard del tax del Seller: **Jesús puede editar** (sin bloqueo de rol); pasos 1-2 completos; pendiente en paso 3/4 (probable W-8BEN-E). Detectado *Tipo de organización = "Asociación"* (verificar para S.L.) y **"Manage default payment profiles" vacío** (falta asignación de payout por defecto). **Se para la config del Marketplace por hoy.** **Mañana 23-jul: reunión con Microsoft ISV Success** (Marcelo, Consultor Técnico de Partners) — sesión *Discovery and Planning*; foro para resolver dudas. Ver `BRIEF-reunion-isv-success-2026-07-23.md`.
- **23-jul-2026** — Rellenando el **formulario fiscal del Seller = W-8BEN-E** (correcto para una S.L. española, beneficiaria real de los pagos; descartados W-8IMY/ECI/EXP). **Determinaciones campo a campo (Claude orienta; el usuario introduce; sin datos fiscales por chat):**
  - *¿Entidad no considerada (disregarded)?* → **No** (la S.L. tiene personalidad propia).
  - *País de organización* → **España**. *Dirección de residencia* → física (no apartado postal) → *¿es apartado/atención?* **No**. *Dirección postal* → en blanco (igual que residencia).
  - *US TIN (EIN)* → **vacío + marcar "no tiene TIN de EE. UU."** (no se necesita EIN si se reclama el tratado con el TIN extranjero).
  - *País de residencia fiscal* → **España**; *TIN* → **NIF `ESB09810946`** (foreign TIN; NO marcar "no tiene"). *(Si lo rechaza por el prefijo, probar `B09810946`.)*
  - *¿Reclama retención reducida por tratado?* → **Sí** (convenio España–EE. UU.).
  - *Estado del Capítulo 3* → **Corporation** ⚠️ (una S.L. tributa por defecto como *corporation* a efectos US; **NO** *Partnership/Asociación* — coherencia con el *Tipo de organización* que salía como "Asociación").
  - *¿Entidad híbrida que reclama tratado?* → **No** (S.L. opaca normal; reclama el tratado en su propio nombre).
  - **Pendiente antes de firmar:** artículo/tipo de renta del tratado + % de retención (asesor/Microsoft) y confirmar `Chapter 3 = Corporation`. Anotado en §5 y §6.
- **23-jul-2026 (reunión Microsoft ISV Success)** — sesión *Discovery and Planning* celebrada (25 min). **El papeleo NO se trató**: las preguntas fiscales y de payout (P11/P12 del brief) no llegaron a plantearse, así que B y B2 siguen igual. Sí salieron tres cosas para este runbook: (1) **fulfillment nativo recomendado por Microsoft** (el SaaS Accelerator no conecta con la app → alta manual por email); (2) **modelo comercial** — su propuesta es *flat rate + metered billing*, ver ⚠️ en la fila G; (3) **leads** en *Referrals* conectables a CRM/webhook/Azure Table (fila G2). Dato suelto útil para el paso J: **cancelar dentro de 72 h desde la compra no se factura**. Notas completas en `BRIEF-reunion-isv-success-2026-07-23.md §6` (volcadas el 27-jul desde la transcripción oficial).
- **27-jul-2026** — Volcadas las notas de la reunión del 23 (la transcripción llegó después de aquella sesión y quedó sin procesar). Agendada la **2ª reunión: 29-jul 15:30**, con brief propio (`BRIEF-reunion-isv-success-2026-07-29.md`) que arrastra las 10 preguntas que quedaron sin responder + las nuevas del modelo de precio y del fulfillment secretless. **El paso I (*Technical configuration*) deja de estar totalmente bloqueado por código:** `SPEC-02` define ya la app de Entra y su tenant/app ID (§6 del spec); faltarán solo las URLs de landing y webhook (SPEC-03/04). Pregunta abierta para el 29: si basta guardar el borrador de la oferta para que las Fulfillment APIs autoricen la app, o hace falta Preview.
