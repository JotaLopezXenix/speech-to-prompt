# DESIGN — Programa `profesionalizacion-marketplace` (v1 comercial)

**Fecha:** 17-jul-2026 · **Fase JCC:** análisis (este documento la cierra)
**Tipo:** programa multi-ciclo — cada ciclo de §3 tendrá su propio DESIGN/SPEC/REVIEW.
**Material previo:** `BRIEF-marketplace-agustin.md` (niveles de oferta, fuentes oficiales) + respuestas de negocio de Agustín tras su reunión con Microsoft (17-jul).

## 1. Objetivo y problema

**Objetivo:** convertir la app de destilación de audio (herramienta personal, hoy en producción para un usuario) en un **producto SaaS transactable publicado en Azure Marketplace**, dirigido a profesionales individuales. Motivo inmediato: desbloquear capacidad de partner con Microsoft (3-4 apps publicadas → varios miles de € en créditos Azure para ampliar catálogo).

**Problema:** la app funciona y está depurada, pero no es publicable: identidad atada al tenant Entra de Xenix (clientes externos no pueden entrar), sin suscripciones ni integración de cobro, aspecto visual y usabilidad por debajo del listón comercial, flujo rígido no mobile-first, sin control de consumo por usuario de cara al negocio.

**Listón que fija "transactable"** (no negociable, lo prueba la certificación de Microsoft): SSO de un clic con cualquier cuenta Microsoft (Entra ID + MSA), landing de activación 24/7, webhook de eventos de suscripción, SaaS Fulfillment APIs, ≥1 plan con precio, perfiles fiscal/payout validados en Partner Center.

## 2. Usuarios y casos de uso

- **Cliente:** profesional individual. Compra la suscripción en el Marketplace (Microsoft gestiona todo el proceso de compra), aterriza en nuestra landing, entra con su cuenta Microsoft (work o personal) y queda dado de alta — el alta autogestionada ES el flujo de compra de Microsoft.
- **Uso principal:** dicta (o importa audio) → transcribe por segmentos → revisa → destila con uno de los 4 modos → obtiene un prompt **adaptado al modelo destino que elija** (GPT/Claude/Gemini) con formato parametrizable. Consulta su histórico y ve el coste de cada operación.
- **Operadores (Xenix):** métricas, estado de suscripciones y consumo por usuario en un backoffice mínimo; el resto vía Partner Center.

## 3. Alcance v1 — troceo en ciclos JCC (orden acordado)

| # | Ciclo | Contenido |
|---|---|---|
| 0 | *(paralelo, sin código)* | Burocracia Partner Center: verificación de cuenta, perfil fiscal, payout (Agustín; latencia de semanas, arrancar ya). Investigación prompt guides por modelo destino + ajustes de formato (deep-research). Verificación de facturación de Claude en Foundry contra crédito Azure. |
| 1 | `identidad-entra` | Sustituir Easy Auth por login OIDC multi-tenant Entra + MSA en el backend. Se conserva `owner_id` y el aislamiento en capa de datos. |
| 2 | `frontend-mobile-first` | Estudio y diseño gráfico (design system, dirección visual, wizard vs. pantalla única — con maquetas) + frontend nuevo portando los módulos ganados con sangre (§6). API formalizada de paso (los futuros clientes móviles la consumirán). |
| 3 | `marketplace-transactable` | Landing de activación, webhook, Fulfillment APIs (nativo en nuestro backend Node), tabla de suscripciones + gating por estado, plan de precio. |
| 4 | `destilado-destino` | **Funcionalidad estrella:** selección del modelo destino del prompt + ajustes de formato (encabezados, inferencias, preguntas abiertas…). Incluye el switch del destilador a Claude en Azure (condicionado a §7-S1) con re-afinado y eval. Aquí se decide si la matriz de prompts cambia de dimensión (estructural). |
| 5 | `uso-y-costes` | Tope fair-use mensual por usuario + costes visibles por operación (los datos ya existen en `usage_events`/`model_prices`; falta la superficie). |
| 6 | `backoffice-minimo` | Métricas de uso, estado de suscripciones, consumo por usuario. |
| 7 | `publicacion` | Ficha (textos, capturas del frontend nuevo, vídeo), certificación, compra de prueba en Preview, go-live. |

El orden 4-5-6 admite flexibilidad; 1→2→3 es dependencia real (todo necesita identidad; las capturas y la landing necesitan el frontend nuevo). Si el calendario aprieta, el candidato a re-decidir es el backoffice (publicable en actualización posterior; el Marketplace lo permite).

## 4. Fuera de alcance (v1)

- **Selección de modelo de destilado (origen)** → v2. Decisión del 17-jul: se relega; la abstracción de proveedores y el gating (`llm_models`) ya existen, reactivarla será barato.
- Ofertas privadas por tenant / compra corporativa multi-empleado (la tabla de suscripciones se diseña sin cerrar esa puerta).
- Paquetes de N sesiones (posible plan futuro; exigiría metered billing).
- Apps móviles nativas y sus stores (la API se diseña contándolos como clientes futuros).
- Login con Google/email (futuro: migración a Entra External ID; `owner_id` se conserva).
- Multilenguaje (queda en §8 como pregunta de dimensionamiento).
- Despliegue en tenant del cliente (managed app).
- BYO-API-key del cliente para destilar.

## 5. Decisiones acordadas ([E] = estructural, decidida en mesa común)

1. **[E] Oferta SaaS transactable** en Azure Marketplace; canal único v1 (respuesta de negocio, 17-jul).
2. **[E] Comprador: profesional individual.** Sin concepto de organización en el modelo de datos v1; suscripciones extensibles a tenant/empresa.
3. **[E] Precio: suscripción mensual plana.** Consumo absorbido en el precio, protegido por fair-use (ciclo 5). Sin metering hacia Microsoft.
4. **[E] Identidad: app multi-tenant Entra + MSA vía OIDC propio** (sustituye Easy Auth). Es exactamente lo que exige el Marketplace; External ID solo si algún día hace falta Google/email.
5. **[E] Fulfillment nativo en el backend Node** (rutas Express); el SaaS Accelerator de Microsoft solo como referencia de flujos. Un solo stack.
6. **[E] Rehacer vs. evolucionar: "cosechar".** Frontend de cero (vanilla sin build no sirve para producto mobile-first) portando los módulos de §6; backend se evoluciona en el mismo repo; identidad se reemplaza.
7. **[E] Destino del prompt como funcionalidad estrella de v1** (decisión del usuario, 17-jul): selector de modelo destino + ajustes de formato del resultado. La investigación previa (ciclo 0) alimenta su design.
8. **Destilador: la voluntad era Claude en Azure (17-jul), pero S1 resultó negativo (§7) → se aplica el fallback acordado: GPT (Azure OpenAI) sigue como destilador en v1.** Claude-como-destilador queda para v2 o para cuando negocio acepte pagar su consumo fuera de créditos (CCU va a tarjeta en suscripciones sponsored). El histórico era el mismo motivo: se abandonó Claude en junio por facturación, no por indisponibilidad.
9. Extras confirmados en v1: fair-use, costes visibles, backoffice mínimo (además del núcleo).

## 6. Qué se PRESERVA (superficie de regresión del programa)

Valor depurado que ningún ciclo puede romper; lo portable se porta como módulo, no se reinventa:

- **Contrato de sesión:** `segments[]` + `transcription_raw/edited` materializados; multi-segmento iterativo.
- **Módulos de captura ganados con sangre:** `audio-recorder.js` (stop intencional/externo, contrato Promise→blob), `audio-guards.js`, patrón de retención de blob + banner Reintentar, warm-up de BD, telemetría `diagnostic_events`.
- **Backend:** abstracción de proveedores (LLM/STT/BlobStore + registries), workaround Groq (reconstrucción desde `words[]`), normalización ffmpeg opcional, robustez del pool (timeouts tarn + `propagateCreateError:false`).
- **Datos:** esquema SQL con owner isolation en capa de datos (`callerId`, cross-owner→404), `usage_events` + `model_prices` (la mitad del control de costes ya hecha), prompts familia×modo en BD con seed desde git (la dimensión puede crecer en el ciclo 4, sin perder el mecanismo).
- **Infra:** pipeline secretless (Managed Identity, red privada), despliegue GitHub Actions, migraciones versionadas.
- **Eval:** `scripts/eval-distill.mjs` + goldens — es la red de seguridad del ciclo 4.

## 7. Supuestos y riesgos

- **S1 (supuesto crítico): VERIFICADO NEGATIVO (17-jul-2026).** Claude en Foundry se factura en Claude Consumption Units (CCU) como consumo de **Azure Marketplace**: es MACC-eligible (compromisos enterprise), pero las **suscripciones patrocinadas que solo usan créditos Azure no están soportadas** y, con tarjeta en la cuenta, *"the credit card will be charged instead of Azure Credits"* (fuentes: [CCU billing](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/claude-models-billing), [Models from partners — Anthropic, restricciones de suscripción](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-from-partners#anthropic)). Los créditos de partner/ISV Success son sponsorship, no MACC → el consumo de Claude NO los decrementaría. **Se aplica el fallback acordado: GPT (Azure OpenAI) sigue como destilador en v1; Claude como destilador queda para v2** (o para cuando se acepte pagarlo a tarjeta — decisión de negocio). El ciclo 4 (`destilado-destino`) no se ve afectado en su parte estrella: el *destino* del prompt es independiente del modelo que destila.
- **R1 (mitigado por S1):** el re-afinado de prompts para Claude-como-destilador ya no aplica en v1. Sigue aplicando el eval de los prompts nuevos del ciclo 4 (destino × formato) con el harness existente.
- **R2:** explosión combinatoria de la matriz de prompts (modo × destino × formato). El design del ciclo 4 debe elegir entre prompts por celda vs. prompt base + capas de instrucciones; decisión estructural pendiente de la investigación.
- **R3:** la certificación transactable prueba la compra e2e; el flujo Fulfillment nativo hay que probarlo contra el entorno de Preview con margen (resubmisión ilimitada mitiga).
- **R4:** alcance amplio (7 ciclos) para una v1; mitigación: ciclos independientes re-decidibles, backoffice como fusible.
- **R5:** la burocracia de Partner Center tiene latencia de semanas y es bloqueante para publicar; mitigación: arranca ya en paralelo (ciclo 0).
- **R6:** fair-use sin datos de mercado; mitigación: fijar umbral con los datos propios de `usage_events` y revisarlo post-lanzamiento.

## 8. Preguntas abiertas

1. **Wizard por pasos vs. pantalla única** → se decide en el design del ciclo 2, con maquetas.
2. **Umbral del fair-use** (minutos de audio/mes, nº destilados) → design del ciclo 5 con datos de `usage_events`.
3. **Precio de la suscripción** (€/mes) → decisión de negocio; no bloquea hasta el ciclo 3.
4. **Nombre comercial y marca** del producto para la ficha → necesario antes del ciclo 7 (idealmente antes del 2, para el diseño visual).
5. **Multilenguaje**: ¿solo interfaz o también prompts de destilado por idioma? Dimensionar en el ciclo 2 (i18n del front es barato de prever, caro de retrofitar).
6. Resultado de la investigación del ciclo 0 → puede reordenar el ciclo 4 (matriz de prompts, ajustes de formato que merecen UI).
