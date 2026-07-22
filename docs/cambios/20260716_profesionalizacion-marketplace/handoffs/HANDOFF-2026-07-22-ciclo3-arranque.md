# HANDOFF — Sesión 22-jul-2026 (2) · Arranque del ciclo 3 `marketplace-transactable`

Bitácora de cierre. Foto fechada con evidencia; la fuente de verdad del estado vivo es la línea "Fase actual" de `CLAUDE.md`. Continúa a `HANDOFF-2026-07-22.md` (que cerró el ciclo 2). Esta sesión **arranca el ciclo 3** (diseño + track burocrático); **no toca código**.

## Estado metodológico

- **Fase actual (al cerrar):** Programa `profesionalizacion-marketplace`. **Ciclo 3 `marketplace-transactable` ARRANCADO**; **JCC Fase 1 (Análisis/Diseño) EN CURSO y PAUSADA** a la espera de la reunión con Microsoft ISV Success (23-jul). **NO existe `DESIGN.md` del código del ciclo 3 todavía** (la entrevista socrática está a medias). Abierto en paralelo el **track burocrático** de Partner Center (runbook).
- **Siguiente command:** continuar **`/jcc-design`** del ciclo 3 (2ª tanda de la entrevista) tras la reunión → luego `/jcc-spec`. En paralelo, avanzar `RUNBOOK-partner-center.md`. No arranca solo: lo decide el usuario.
- **Restricciones activas (no saltar):**
  - **Decisiones ESTRUCTURALES del ciclo 3 pendientes → mesa común** (no absorber en silencio): (a) comprador **individual vs. empresa** (modela la tabla de suscripciones); (b) **autoservicio vs. alta manual** (flujo de la landing); (c) **reconciliación identidad-comprador** (identidad del token de compra vs. login MSAL); (d) **punto de aplicación del gate**; (e) **tensión secretless** del fulfillment (client secret vs. credencial federada). Las tres primeras las alimenta la reunión de MS.
  - El **gate por suscripción SUSTITUYE la lista blanca** `ALLOWED_EMAILS` (hoy en `src/middleware/identity.js:55`, fail-closed, solo Jesús+Agustín). Al hacerlo **muerde el hueco H6**: `users.email` es `NOT NULL` → un suscriptor con token sin claim `email` reventaría el JIT (`ensureUser`). Resolver en el ciclo 3.
  - **Preservar (no romper):** validación de token del ciclo 1 (`src/services/token-verify.js` — frontera de seguridad, **NO tocar**), aislamiento por `owner_id`/`callerId`, contrato de sesión, salvaguardas de captura R1, red privada secretless (SQL/Blob/AOAI por Managed Identity). **Superficie NUEVA del ciclo 3** = landing + webhook públicos 24/7 → seguridad a diseñar (token de compra no confiable en query; validar el JWT del webhook: `aud`=nuestra app, `appid/azp`=`20e940b3-…`, `tid`=nuestro tenant).
  - **Regla del runbook:** los **formularios fiscales/bancarios los rellena el usuario**; Claude guía, no introduce datos fiscales/bancarios ni credenciales.
- **Evidencia del estado (artefactos y su estado):**
  - Nueva carpeta `ciclo-3-marketplace-transactable/` con 4 docs (**todos SIN commitear**): `RUNBOOK-partner-center.md`, `BRIEF-reunion-isv-success-2026-07-23.md`, `Brief-Speech-to-prompt-ISV-Success.docx`, `ARQUITECTURA.md`. **NO hay `DESIGN.md`.**
  - Artefacto publicado (diagrama de arquitectura, privado): `https://claude.ai/code/artifact/a9966b27-8324-4ef6-a17c-2107a48f4cb5`.
  - `README.md` del programa **modificado** (fila ciclo 3, entrada de docs, nota de troceo) — sin commitear.
  - **git:** rama `main`, último commit `7c2f1e2`. Sin commitear: `README.md` (M) + carpeta `ciclo-3-marketplace-transactable/` (untracked). **Nada pusheado.**

## Estado real del Partner Center (mapeado esta sesión · detalle en el runbook)

- Cuenta Xenix: **verificada + enrolada** en el commercial marketplace ✅. Jesús = Account admin (**puede** editar fiscal/payout).
- **Payout ✅:** 2 payment profiles *Complete* (CaixaBank ...5391): `MPNIncentives`, `XENIX SOLUTIONS`.
- **Fiscal 🟡:** tax MPN (6541588) *Complete*; **tax del Seller `87879330` = "Action required"** (probable W-8BEN-E; *Tipo de organización = "Asociación"* — verificar si es correcto para una **S.L.**).
- **Asignación:** "Manage default payment profiles" **vacío** → falta asignar payout por defecto/por programa.
- Oferta SaaS **`speechtoprompt`** en **Draft** (2 planes: Basic sin configurar, Trial flat-rate público). `move2cloud` = Professional service abandonada (falló certificación en 2024), no aporta nada. **IDs:** Seller **87879330**, MPN **6541588**, XENIX SOLUTIONS S.L.
- **Reencuadre de la RUTA CRÍTICA:** la burocracia estaba **mucho más avanzada de lo temido** — no hay "alta desde cero" (banco+fiscal, semanas). Queda **una acción fiscal + la asignación de payout**.

## Qué se hizo esta sesión

1. **Investigación web actualizada** del Microsoft Marketplace (SaaS transactable) con fuentes MS Learn 2025-2026 (informe completo entregado en el chat; hallazgos clave abajo).
2. **Mapeado del estado real del Partner Center** con capturas del usuario → `RUNBOOK-partner-center.md` (checklist maestro, bloqueos, bitácora).
3. **Preparación de la reunión Microsoft ISV Success (23-jul):** `BRIEF-reunion-isv-success-2026-07-23.md` + versión Word `Brief-Speech-to-prompt-ISV-Success.docx` (brief + arquitectura embebida) + `ARQUITECTURA.md` (2 diagramas Mermaid) + artefacto publicado.
4. **Decisión:** la burocracia se lleva como **track/runbook propio** dentro del ciclo 3 (no ciclo aparte).
5. **Entrevista de diseño (Fase 1) iniciada:** 1ª tanda resuelta (dependencia ciclo3↔alta = paralela/convergente; oferta existente; estructura del papeleo). **2ª tanda (decisiones estructurales) pendiente** hasta la reunión.

## Hallazgos clave de la investigación (insumo para el DESIGN)

- Hoy es **"Microsoft Marketplace"** (rebrand sep-2025 de Azure Marketplace + AppSource), gestionado en **Partner Center**. Nuestra oferta = SaaS **"Sell through Microsoft" (transactable)**, plan flat mensual.
- **Technical configuration = 4 campos** (Landing URL, Webhook URL, Entra tenant ID, Entra app ID): obligatorios para **publicar en Preview**, **no** para el borrador → **código y papeleo van en paralelo y convergen en la compra de prueba en Preview**.
- **Fulfillment:** landing (`resolve`→`activate`, token en header `x-ms-marketplace-token`, caduca 24 h) + webhook (`Subscribe/Unsubscribe/ChangePlan/ChangeQuantity/Suspend/Reinstate/Renew`; responder 200 + validar vía Get Operation). API v2 base `marketplaceapi.microsoft.com`, `api-version=2018-08-31`.
- **Tensión secretless (estructural):** la app Entra del fulfillment usa client-credentials con **client secret** (scope `20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default`), Microsoft recomienda **app dedicada single-tenant** → choca con nuestro invariante secretless → evaluar **credencial federada / workload identity** (pregunta para MS).
- **Tax/payout** solo se exigen en transactable (nivel cuenta/Seller ID, validación ≤48 h). **Certificación manual < 2 días hábiles** (visto en la UI de la oferta move2cloud). Preview sin coste: private plan a $1 / cancelar en 72 h / ticket. Reenvíos ilimitados.

## Qué se verificó CON EVIDENCIA REAL

- **Investigación:** fuentes oficiales MS Learn citadas con fecha (2025-2026) en el informe.
- **Diagramas:** renderizados con Mermaid vía navegador (Playwright) y **revisados visualmente** (diag1 arquitectura actual, diag2 integración fulfillment) — correctos y legibles.
- **Word:** verificado **estructuralmente** (unzip de `document.xml` + rels): 2 imágenes embebidas en `word/media` + referenciadas, texto clave presente, 6 encabezados, tablas. **NO se verificó el maquetado final en PDF** (no hay LibreOffice/pandoc/pdftoppm en esta máquina Windows) → **PENDIENTE: el usuario abre el `.docx` y da el visto bueno al maquetado.**
- **README del programa:** editado (fila ciclo 3 + entrada de docs + nota de troceo → runbook propio).

## Pendientes

- **De esta sesión:** (1) el usuario **revisa el maquetado del `.docx`**; (2) **commit/push** de los docs nuevos + el README (todo sin commitear).
- **Del ciclo 3 (diseño):** 2ª tanda de la entrevista socrática tras la reunión → escribir `DESIGN.md` del código → `/jcc-spec`.
- **Burocracia (runbook):** resolver el "Action required" del tax del Seller 87879330 + asignar el payout por defecto.
- **Cross-cutting heredados (siguen abiertos):** prueba de fuego §8.3 de `robustez-coldstart-sql` (cold-start real, coordinar con Agustín); bump Node 20→24 del workflow; limpieza futura (retirar redirect transitorio `/app→/` + alias `/api/*` sin versión); añadir IP de Agustín al firewall SQL/Storage; smoke funcional logueado de `mejorar-destilado-limpio`.

## Cómo retomar (próxima sesión)

1. **Reconciliar:** leer "Fase actual" de `CLAUDE.md` + este handoff + `RUNBOOK-partner-center.md` + índice global `docs/cambios/README.md`; confirmar estado git (docs sin commitear salvo que se hiciera al cerrar).
2. **Tras la reunión de MS:** volcar respuestas en `BRIEF-…§6` (notas) y en el runbook; retomar **`/jcc-design`** (2ª tanda) con las decisiones estructurales resueltas → escribir `DESIGN.md` del ciclo 3.
3. **En paralelo:** avanzar el `RUNBOOK-partner-center.md` (tax del Seller + asignación de payout).

## Decisiones tomadas "en caliente" (releer en frío)

- **Burocracia como track/runbook propio** dentro del ciclo 3 (no ciclo separado).
- **Diseño del código pausado a propósito** hasta la reunión (sus respuestas son insumo estructural) — es secuenciación, no bloqueo.
- **Fulfillment nativo** reafirmado (D5 del DESIGN del programa) frente al SaaS Accelerator; el Accelerator solo como referencia.
- La **RUTA CRÍTICA del programa se reencuadra**: la burocracia de Partner Center ya no es "semanas desde cero" (cuenta+payout hechos); el cuello real pasa a ser la **integración técnica del ciclo 3** + una acción fiscal menor.
