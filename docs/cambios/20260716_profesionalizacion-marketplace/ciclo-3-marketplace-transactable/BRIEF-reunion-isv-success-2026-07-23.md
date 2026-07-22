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

*(rellenar durante/después: respuestas de Microsoft, compromisos, próximos pasos, quién hace qué)*
