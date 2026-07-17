# DESIGN — Ciclo 2 `frontend-mobile-first`

**Programa:** `profesionalizacion-marketplace` (ver `../DESIGN.md`, §3 troceo ciclo 2, §5 decisión estructural 6 "cosechar", §6 superficie de regresión).
**Fecha:** 17-jul-2026 · **Fase JCC:** análisis (este documento la cierra).
**Tipo:** cambio grande sobre producto existente (rehacer frontend; backend se preserva).

## 1. Objetivo y problema

**Objetivo:** rehacer el frontend **de cero, mobile-first, con calidad visual y usabilidad de nivel producto**, portando los módulos de captura ganados con sangre (no reinventarlos) y formalizando el contrato de la API para que lo consuman también los futuros clientes móviles nativos.

**Problema:** el frontend actual (vanilla ES modules sin build, ~1.742 líneas) fue la decisión correcta para una herramienta personal, pero es el cimiento equivocado para un producto comercial: aspecto y usabilidad por debajo del listón del Marketplace, no mobile-first, flujo rígido, y sin base para clientes nativos. Retorcerlo sería lo peor de ambos mundos → se cosecha (frontend nuevo; backend evoluciona).

## 2. Usuarios y casos de uso

- **Profesional individual en móvil** que necesita el **flujo completo** (captura multi-segmento → revisión → destilado → resultado) con la misma comodidad que en escritorio (no solo captura). Mobile-first, pero paridad de flujo.
- **Mismo usuario en escritorio:** experiencia responsive coherente.
- La **captura** conserva sus salvaguardas (no perder audio ante cortes espontáneos, banner Reintentar, warm-up de BD) — criterio duro heredado.
- **Futuro (fuera):** apps nativas Android/iPhone consumiendo la API formalizada.

## 3. Alcance y sub-descomposición

El ciclo se parte en dos sub-ciclos (acordado):

### 2a — Diseño (siguiente actividad)
- **Estudio visual + dirección de diseño** + **design system** (tokens: color, tipografía, espaciado; inventario de componentes).
- **Maquetas estáticas** de las pantallas clave (no prototipo funcional): login, captura, revisión, destilado (con hueco para los controles del ciclo 4), resultado, historial, ajustes.
- **Decidir wizard-por-pasos vs pantalla-única** (pregunta abierta del programa §8.1) con las maquetas sobre la mesa.
- **Herramienta:** se puede usar **Claude Design** (lo conduce el usuario; handoff a Claude Code para 2b) **o** generar las maquetas como **artifacts HTML** directamente. El design system definido sirve para ambas vías y para 2b.
- **Entregable:** dirección + design system + maquetas + decisión de UX. Es la entrada del SPEC de 2b.

### 2b — Construcción
- **Frontend nuevo** sobre el diseño aprobado, con el stack de §4.
- **Portar** los módulos de captura (§5) y **re-expresar** la orquestación de salvaguardas.
- **Login real** integrando MSAL contra el contrato bearer del ciclo 1.
- **Formalizar la API:** documentar `/api/*` como **OpenAPI** + **cliente tipado** en el frontend + **versionado `/api/v1`** (alias de rutas aditivo; el backend NO se reescribe).
- **Anticipar** (dejar hueco, no implementar): controles de destino+formato del destilado (ciclo 4), costes visibles (ciclo 5), acceso a backoffice (ciclo 6).
- **i18n dimensionado:** estructura preparada para internacionalización (strings externalizados, andamiaje de locale), español por defecto; traducciones reales = después.

### FUERA de alcance
- **Apps nativas** Android/iPhone (ciclo futuro; la API formalizada aquí es lo que consumirán).
- **Reescribir el backend** o su lógica de negocio (solo se añade el alias `/api/v1` + OpenAPI).
- **Implementar** destino+formato del destilado (ciclo 4), costes visibles (ciclo 5), backoffice (ciclo 6), traducciones i18n reales.
- Cambiar el **contrato de sesión** o el flujo de datos.

## 4. Decisiones acordadas ([E] = estructural, ratificada en mesa común)

1. **[E] Sub-división 2a (diseño, maquetas estáticas) / 2b (construcción).** 2a no llega a funcional.
2. **[E] Móvil = flujo completo** (paridad), mobile-first, **PWA instalable** (sensación de app antes de las nativas).
3. **[E] Stack de 2b: React + Vite + TypeScript + Tailwind + shadcn/ui (Radix), como PWA.** Ratificado (el usuario delega la elección técnica). Porqué: (a) es donde los **agentes de codificación** —que mantendrán el proyecto— son más fluidos y seguros; (b) shadcn/Tailwind da la calidad visual buscada y Claude Design hace handoff natural a React/Tailwind; (c) mantiene abierta la vía **nativa** (Capacitor para envolver, o React Native para compartir lógica) **sin sobre-invertir hoy**; (d) PWA como intermedio. Introduce **build step** (ruptura deliberada del "sin build" actual, que era para la herramienta personal).
4. **[E] "Cosechar":** portar `audio-recorder.js`, `audio-guards.js`, `diagnostics.js` (lógica de navegador, agnóstica de UI) y **re-expresar** la orquestación de salvaguardas hoy incrustada en `phase1-capture.js` **preservando su comportamiento**.
5. **Formalizar la API** = OpenAPI del contrato existente + cliente tipado + `/api/v1` (aditivo). No es reescritura del backend.
6. **Apps nativas = ciclo futuro**; se decide entonces Capacitor vs React Native. Hoy solo no se quema el puente.
7. **Claude Design** es opcional (acelerador de 2a conducido por el usuario); alternativa equivalente = artifacts HTML. Decisión reversible, se prueba en 2a.
8. **wizard vs pantalla-única:** NO decidido aún — se resuelve en 2a con maquetas.

## 5. Qué se PRESERVA (superficie de regresión)

- **Backend y API `/api/*`:** comportamiento intacto. El frontend nuevo consume el mismo contrato (formalizado como OpenAPI + alias `/api/v1`). No se toca la lógica de negocio ni el contrato de sesión.
- **Flujo de 4 fases** (captura multi-segmento → revisión → destilado → resultado) y **contrato de sesión** (`segments[]` + `transcription_raw/edited` materializados): preservados en comportamiento, aunque cambie la UI.
- **Salvaguardas de captura (CRÍTICO, mayor riesgo del ciclo):** recuperación del blob ante stop externo sin pérdida de audio, banner Reintentar/Descartar, warm-up de BD, telemetría `diagnostic_events`, y la ausencia de falsos positivos en parada intencional. Los módulos hoja se portan; la orquestación se re-expresa con verificación equivalente (repro del stop externo).
- **Ajustes** (config de proveedores/API keys) e **Historial** (listar/reabrir sesiones, reanudando en la fase correcta).
- **Identidad:** consume el contrato bearer del ciclo 1 (rama `identidad-entra`); el bypass `DEV_USER_*` local sigue sirviendo para desarrollo.

## 6. Supuestos, riesgos y preguntas abiertas

**Supuestos:**
- La PWA responsive cubre la "sensación de app" hasta que exista el ciclo nativo.
- El contrato `/api/*` actual es estable y suficiente para el frontend nuevo (se documenta, no se rediseña).

**Riesgos:**
- **R1 (regresión, alto):** re-expresar las salvaguardas de captura fuera de `phase1-capture.js` sin perder comportamiento (no perder audio, sin falsos positivos). Mitigación: portar los módulos hoja tal cual y tratar la orquestación como sub-tarea con verificación de repro equivalente (parada externa vía Playwright, como en su ciclo original).
- **R2 (integración de ramas):** el ciclo 1 (`identidad-entra`) y este ciclo viven en ramas pendientes de merge; el login real de 2b necesita el contrato bearer del ciclo 1. **A resolver en el SPEC de 2b:** ramificar 2b sobre `identidad-entra`, o merge de identidad primero (tras su cutover) y luego 2b sobre `main`. Mientras, el bypass `DEV_USER_*` permite desarrollar 2b sin bloquear.
- **R3 (alcance):** 2a+2b es grande; acotar 2a a las pantallas clave (no todos los estados) para no dispararlo.
- **R4 (Claude Design beta):** es beta y lo conduce el usuario; si se atasca, fallback a artifacts HTML (ya previsto).
- **R5 (build step nuevo):** introduce tooling de build/deploy que hoy no existe; el despliegue en Azure App Service pasa de servir estáticos a servir el build de Vite (a detallar en SPEC de 2b).

**Preguntas abiertas:**
1. **Wizard vs pantalla-única** → se decide en 2a con maquetas.
2. Especificidades del **design system** (paleta, tipografía, densidad) → 2a.
3. Alcance de las **maquetas** de 2a: ¿qué pantallas y qué estados entran como "clave"? → acotar al arrancar 2a.
4. **Profundidad de i18n** (¿solo interfaz, o también prompts por idioma?) — se dimensiona la estructura ahora; la decisión de traducir se toma después (ligada al ciclo 4/negocio).
5. **Orden de integración de ramas** (R2) → SPEC de 2b.
