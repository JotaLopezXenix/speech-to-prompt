# Brief — Reunión Microsoft ISV Success · *Discovery and Planning*

**Fecha:** 23-jul-2026 · **Programa:** Microsoft ISV Success (Xenix enrolada)
**Interlocutor MS:** Marcelo — Consultor Técnico de Partners.
**Asistentes Xenix:** Jesús López (responsable técnico / arquitectura) · Agustín Hernández (negocio / partner).
**Objetivo de la sesión (según convocatoria):** profundizar en la solución y los próximos objetivos, alinear cómo ISV Success puede ayudar. Es una sesión **técnica de descubrimiento y planificación**, no de venta.

> Este brief prepara la reunión: pitch, estado actual mapeado a su agenda, preguntas a resolver y materiales. El diagrama de arquitectura acompaña este documento.

---

## 1. Elevator pitch — qué estamos construyendo

**Speech-to-prompt** convierte **dictado de voz en prompts de alta calidad para LLMs**. El profesional dicta (o importa audio) por segmentos → se transcribe → revisa → **destila** con uno de 4 modos → obtiene un **prompt limpio y estructurado**, listo para pegar en el modelo destino que elija. Guarda su histórico y ve el coste de cada operación.

- **Para quién:** profesional individual que trabaja con IA (arquitectos, consultores, product, legal…) y quiere pasar de "hablar" a "un buen prompt" sin fricción, también en **móvil (PWA instalable)**.
- **Diferencial:** los *system prompts* de destilación afinados (español con tecnicismos en inglés, siglas dictadas) + la futura **selección de modelo destino** con ajustes de formato (ciclo 4, funcionalidad estrella).
- **Estado:** **ya en producción** (uso interno en Xenix con dato real), **100% Azure** y **secretless**. Ahora lo profesionalizamos para **publicarlo como SaaS transactable en Microsoft Marketplace**.

## 2. Objetivo de negocio (el porqué)

Convertir la herramienta en un **producto SaaS transactable en Microsoft Marketplace** para **desbloquear capacidad de partner con Microsoft** (varias apps publicadas → créditos Azure para ampliar catálogo). Canal único v1: Marketplace. Comprador: profesional individual. Precio: **suscripción mensual plana** (sin metered).

---

## 3. Estado actual mapeado a la agenda de Marcelo

| Punto de su agenda | Dónde estamos |
|---|---|
| **Contexto y objetivos** | Producto en prod (uso interno); objetivo = publicarlo transactable para desbloquear capacidad de partner + créditos. |
| **Preparación de clientes y acuerdos** | Sin clientes externos aún (uso interno Jesús+Agustín vía lista blanca interina). Sin acuerdos pendientes. Pregunta abierta: ¿comprador individual vs empresa?, ¿autoservicio vs alta manual? |
| **Estrategia de Marketplace** | Oferta **SaaS "Sell through Microsoft" (transactable)**, plan **flat mensual**. Oferta ya creada en **borrador** (`speechtoprompt`). Cuenta verificada; **payout ✅**; **fiscal** a falta de 1 acción (Seller 87879330). |
| **Plataformas técnicas** | **100% Azure, secretless** (ver diagrama): App Service (Node) + SPA React/PWA, Entra multi-tenant + MSA, Azure SQL + Blob + Azure OpenAI (gpt-4.1 + Whisper) por **Managed Identity** tras **Private Endpoints**. CI/CD GitHub Actions. |
| **Planificación** | Programa de 7 ciclos (§4). Ciclos 1 (identidad) y 2 (frontend mobile-first) **cerrados y en prod**. Ahora **ciclo 3 = marketplace-transactable** (landing + webhook + Fulfillment APIs + suscripciones + gating). |
| **Próximos pasos** | Construir la integración de fulfillment + cerrar el papeleo → **compra de prueba en Preview** → certificación → Go live. Buscamos alinear con sus hitos y soporte. |

### Roadmap (7 ciclos del programa)

1. `identidad-entra` — **✅ cerrado, en prod** (login OIDC multi-tenant Entra + MSA).
2. `frontend-mobile-first` — **✅ cerrado, en prod** (SPA React mobile-first, PWA instalable).
3. **`marketplace-transactable` — 🔨 EN CURSO** (landing, webhook, SaaS Fulfillment APIs nativas, tabla de suscripciones + gating por estado, plan de precio).
4. `destilado-destino` — selección de modelo destino + ajustes de formato (**funcionalidad estrella**).
5. `uso-y-costes` — fair-use + costes visibles.
6. `backoffice-minimo` — métricas, suscripciones, consumo.
7. `publicacion` — ficha, certificación, compra de prueba, go-live.

---

## 4. Preguntas para Microsoft (priorizadas)

### A. Programa, capacidad y beneficios *(negocio — Agustín)*
1. **La capacidad que buscamos con varias apps publicadas: ¿de qué programa cuelga** (ISV Success, Marketplace Rewards, otro)? ¿**Basta "Contact me"/listado** o deben ser **transactables**? ¿Número objetivo y **plazos**?
2. **Beneficios ISV Success concretos:** ¿qué **créditos Azure** nos corresponden (Core / Expanded) y qué **cubren**? ¿Cubren el consumo de **Azure OpenAI** (first-party)? ¿Incluye **horas de soporte técnico / dev**?
3. ¿Hay **Engagement Manager / Marketplace Rewards** asociados y qué desbloquean?

### B. Estrategia de Marketplace y clientes *(mixto)*
4. Al certificar una **SaaS transactable**, ¿qué revisáis exactamente (ficha, demo o **compra e2e**)? ¿**Tiempos** reales de certificación? *(la UI indica "manual < 2 días hábiles")*
5. ¿Modelamos el comprador como **profesional individual** o **empresa** (varios empleados por cuenta)? *(condiciona nuestro modelo de datos)*
6. ¿El alta debe ser **autoservicio** desde el día 1 o podemos **dar de alta manualmente** al principio (private plan / preview)?

### C. Técnicas — integración de fulfillment *(técnico — Jesús)*
7. **Secretless:** la app de Entra para el **fulfillment** (client-credentials contra las SaaS Fulfillment APIs) pide *client secret*. Somos **secretless por Managed Identity**. ¿Se puede usar **credencial federada / workload identity federation** en lugar de secreto? ¿Guía/ejemplo?
8. ¿Recomendáis el **SaaS Accelerator** o implementación **nativa** del fulfillment (nuestra elección)? ¿Soporte para la **primera oferta transactable**?
9. **Compra de prueba en Preview sin coste:** ¿mejor **private plan a $1**, **cancelar en 72 h**, o **ticket**? ¿Recomendáis **oferta DEV** separada?
10. **Crédito vs Marketplace-billing (hallazgo nuestro):** ¿existe algún vehículo (ISV Success/MACC) para que el consumo de **modelos de partner (p. ej. Claude en Foundry)** se pague **con créditos** y no a tarjeta? *(si sí, reconsideramos Claude como destilador en el ciclo 4)*

### D. Papeleo pendiente *(por si lo pueden enrutar — negocio)*
11. Tax profile del **Seller 87879330 = "Action required"**: ¿qué falta y a qué equipo se escala? ¿El *Tipo de organización = "Asociación"* es correcto para una **S.L.**?
12. Falta la **asignación de payout por defecto** al programa Marketplace ("Manage default payment profiles" vacío): ¿cómo se asigna correctamente?

---

## 5. Materiales a llevar / enseñar

- **Demo en vivo** de la app en producción (login Microsoft real → dictar → destilar → resultado; enseñar la **PWA en móvil**). Baza fuerte: ya funciona.
- **Diagrama de arquitectura** (adjunto): resalta **100% Azure + secretless + red privada** — justo lo que Microsoft valora en certificación.
- **Roadmap** (§4): muestra tracción (2 ciclos cerrados) y visión (funcionalidad estrella + monetización).
- (Opcional) el **hallazgo S1** de facturación de modelos de partner, si sale el tema de IA/Claude.

---

## 6. Notas post-reunión

*(volcadas el 27-jul desde la transcripción oficial de Teams: `docs/reuniones/Primera reunión con Microsoft. Transcript. Discovery and Planning.docx`, 23-jul 09:58, 25 min. Asistentes: Marcelo Miranda y Laura Granda (Accenture, por Microsoft ISV Success), Agustín, Jesús.)*

**Carácter de la sesión.** Fue *Discovery and Planning*: Microsoft escucha, encuadra y propone siguientes pasos. **No fue una sesión técnica de profundidad** — de las 12 preguntas del §4 solo se abordaron 2 (la 8 y, parcialmente, la 5). Las técnicas de fulfillment y todo el papeleo quedaron sin tratar.

**Respondido:**

- **[P8 — nativo vs SaaS Accelerator] Microsoft recomienda implementación NATIVA para nuestro caso.** Marcelo, tras conocer que queremos experiencia 100% self-service: *"yo personalmente recomendaría crear"*. Su razón: el SaaS Accelerator es una capa de integración **sin conexión con la aplicación** — el cliente compra, aterriza en la landing del Accelerator y **lo único que ocurre es que llega un email al partner, que crea la cuenta a mano**. Sirve como base o referencia, no como atajo. **Confirma la decisión [E]5 del DESIGN.**
- **Flujo landing + webhook.** Al completarse el pago, Partner Center llama al **webhook** (con plan ID, cliente y demás) **y al mismo tiempo** el cliente es redirigido a la **landing**, a la que llega **con el mismo login con el que compró**. La landing es "la primera experiencia gestionada por vosotros" y puede hacer el alta directa. **Respalda la decisión [E]1 ("misma cuenta", match estricto).**
- **[P5, parcial] Modelo comercial.** Dos opciones: (a) **por usuario** — el cliente indica cantidad en la compra, llega por webhook y la app asigna usuarios; (b) **flat rate + pay-as-you-go (metered billing)** — cuota fija (posiblemente 0) más dimensiones de consumo (nº de solicitudes, tokens) definidas en Partner Center y **reportadas por la app vía Metering API**. Marcelo la ve encajar aquí por el coste variable de IA. **Agustín manifestó que quieren pay-as-you-go.** Sobre el reporte: *"lo recomendamos que la aplicación directamente haga la llamada de API a Microsoft reportando el consumo… sería importante poner esa lógica en la aplicación ya"*.
- **Leads.** Cada intento de suscripción genera un *lead* en la sección **Referrals** de Partner Center (útil para contactar a quien no completa la compra); configurable en *Offer setup* hacia CRM externo, webhook o Azure Table.

**No tratado (sigue abierto):**

- **[P7] Credencial federada / secretless del fulfillment** — la pregunta no llegó a plantearse. *Resuelto por nuestra cuenta el 27-jul contra la documentación de Microsoft: es viable en same-tenant (el bloqueo `AADSTS700236` es exclusivo de cross-tenant). Ver `SPEC-02_fulfillment-secretless.md` §2.2. Se llevará al 29-jul como validación, no como bloqueo.*
- **[P1–P3] Programa, créditos Azure, Marketplace Rewards, Engagement Manager.**
- **[P4] Qué revisa exactamente la certificación y plazos reales.**
- **[P6] Autoservicio desde el día 1 vs. alta manual.**
- **[P9] Compra de prueba en Preview sin coste** (private plan a $1 / cancelar en 72 h / oferta DEV).
- **[P10] Crédito vs. Marketplace-billing** para modelos de partner (Claude en Foundry).
- **[P11–P12] Papeleo fiscal y payout.** *(Nota: la cancelación dentro de 72 h desde la compra no se factura — dato suelto que Marcelo mencionó y que sirve para P9.)*

**Compromisos y siguientes pasos:**

| Quién | Qué | Estado |
|---|---|---|
| Marcelo | Enviar email con enlaces y documentación de Marketplace | ¿recibido? — verificar |
| Marcelo | Enviar la transcripción | ✅ recibida (en `docs/reuniones/`) |
| Marcelo | Enviar encuesta de la sesión e invitación al seguimiento | — |
| Ambos | **Reunión de seguimiento: 29-jul-2026, 15:30** (se movió del 30 por viaje de Agustín) | ✅ agendada → `BRIEF-reunion-isv-success-2026-07-29.md` |
| Microsoft (oferta) | Sesión de **revisión de arquitectura con un arquitecto** del equipo | ofrecida, sin agendar |
| Microsoft (oferta) | Ayuda con **private offers** cuando haya primer cliente | ofrecida |

**Consecuencia para el ciclo:** aparece una **tensión no resuelta** entre lo que se le comunicó a Microsoft (pay-as-you-go / metered billing) y el `DESIGN.md` §4, que deja el metered billing **fuera de alcance de v1** y asume comprador individual sin `quantity`. No afecta a SPEC-02, pero sí a SPEC-03/06. Decisión de negocio pendiente; primera pregunta del brief del 29.
