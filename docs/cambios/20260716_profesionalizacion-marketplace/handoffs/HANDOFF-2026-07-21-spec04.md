# HANDOFF — Sesión 21-jul-2026 (tarde) · SPEC-04 captura+salvaguardas + refactor de docs JCC v1.2

Bitácora de cierre. Foto fechada con evidencia; la fuente de verdad del estado vivo es la línea "Fase actual" de `CLAUDE.md`. Complementa a `HANDOFF-2026-07-21.md` (que cerró SPEC-02 y SPEC-03 esa misma mañana).

## Estado metodológico

- **Fase actual:** programa `profesionalizacion-marketplace`, ciclo 2 `frontend-mobile-first`, sub-ciclo **2b (construcción)**. **4 de 6 SPEC CERRADOS** (01 cimiento · 02 API tipada · 03 auth/login · **04 captura+salvaguardas, R1**), los cuatro desplegados y verificados en Azure; SPEC-04 con smoke logueado e2e del usuario (incl. móvil).
- **Siguiente command que toca:** **`/jcc-spec` del SPEC-05** (resto del flujo: Revisión / Destilado / Resultado reales). Luego SPEC-06 (marco: Historial/Ajustes) y el **cutover final `/app→/`**. SPEC 05-06 just-in-time.
- **Restricciones activas (no saltar):**
  - Decisiones estructurales de 2b (cerradas): app en **`web/`** (package.json propio; backend intacto en raíz); **entrega incremental a `main` + cutover final** (prod sirve `public/` viejo en `/`, el nuevo en **`/app`** temporal).
  - Stack: React 19 + Vite 8 + TS 6 + **Tailwind v4 CSS-first** + shadcn + react-router 7 + oxlint. Cliente tipado `openapi-fetch` (`/api/v1`), tipos con `npm run gen:api` (**`openapi-typescript` vía npx, NO devDep**; nunca en build/CI). Auth `@azure/msal-react` + `sessionStorage` + redirect; costuras `setTokenProvider`/`setUnauthorizedHandler`/`getCachedToken` en `client.ts`.
  - **Qué se PRESERVA:** frontend viejo en `/` (incl. `public/js/auth.js`) intacto; backend `/api/*` + alias `/api/v1` + `identity` intactos; contrato de sesión y flujo de 4 fases; **salvaguardas de captura R1** (no perder audio, banner Reintentar, warm-up, telemetría `diagnostic_events`, sin falsos positivos); identidad bearer del ciclo 1; **devBypass local**.
  - **Cutover final (SPEC-06/cierre 2b):** mover `vite base` + `basename` de `/app`→`/`, retirar el bloque `/app` de `server.js` y el `public/` viejo; `redirectUri` MSAL pasa a `origin+/` (el origen raíz ya está registrado en Entra).
- **Evidencia del estado (para reconciliar al arrancar):**
  - `main` contiene SPEC-04 (`2e59fb1` feat + `7730c22` fix) y el **commit de cierre de docs v1.2 de esta sesión**; todo **en `main` y `origin`**, árbol limpio, **sin ramas pendientes** (`2b-04-captura` borrada, era local).
  - SPEC escritos: `SPEC-01…04` en `ciclo-2-frontend-mobile-first/`. **SPEC-05/06 NO escritos.**
  - Código en `main`: `web/src/capture/` (módulos hoja + `useCapture`), `web/src/session/` (contexto `ActiveSession`), `web/src/routes/Capture.tsx` (real), `client.ts` (+fachadas + cache de token).
  - Azure (prod): `/`=viejo; `/app/`=SPA nuevo con captura real + login MSAL; `/api/*` y `/api/v1/*` vivos. Host = `speech-to-prompt-xenix-hnc4ccfbfkdcdjem.westeurope-01.azurewebsites.net`.

## Qué se hizo esta sesión

**SPEC-04 `captura-salvaguardas` (R1, el hueso del ciclo) — de punta a punta:** especificar → implementar → revisar (bucle 3↔4) → desplegar → verificar.

1. **Especificado** (`SPEC-04_captura-salvaguardas.md`). Decisiones de mesa común: (a) contexto React `ActiveSession` para llevar la sesión entre fases; (b) **mitigación micro en capas** (aviso de sonido EN VIVO durante la grabación en todas las plataformas + selector/medidor pre-grabación SOLO en escritorio `md`+ + guard post-grabación + importar); (c) portar los módulos hoja verbatim a TS + re-expresar la orquestación como hook `useCapture()`; (d) fachadas `addSegment` (multipart) y `getSegmentAudio` (blob) en `client.ts` (cierra el diferido de SPEC-02).
2. **Implementado** (rama `2b-04-captura`): `web/src/capture/{audio-recorder,audio-guards,diagnostics,mic-meter,events}.ts` (ports verbatim + extracción del meter), `useCapture.ts` (orquestación, estado mutable en refs), `Capture.tsx` (vista de los 4 estados del diseño 2a), `web/src/session/{activeSessionContext.ts,ActiveSessionProvider.tsx}` (montado bajo `RequireAuth` en `App.tsx`), fachadas + cache síncrono de token para el beacon en `client.ts`, i18n `capture.*`. **Sin deps nuevas** (`package.json`/lock intactos). Sin cambios de backend/esquema/migración.
3. **Revisado** (subagente INDEPENDIENTE): base limpia (0 ALTA, ports fieles, regresión intacta) con **2 MEDIA acotadas + BAJA**. **Bucle 3↔4 (elección del usuario: 2 MEDIA + BAJA baratas):** M1 candado de reentrada (`transitioningRef` envuelve toda la operación async de `toggleRecord`; reemplaza el `disabled` del viejo durante stop()+guard; evita grabación espuria por doble-clic y el cuelgue de `commitSegment` al tocar Grabar durante el banner suspect); M2 desmontar grabando **para el recorder** (parada intencional, sin salvaguarda) → libera el micro; B3 strings del hook externalizados a i18n (`audio-guards.ts` se deja en español por ser port verbatim); B4 la promesa de banner pendiente se resuelve al desmontar. **BAJA 5 (repoblar selector al cruzar `md`) + informativos (`handling401`, bundle MSAL, doble-bootstrap StrictMode dev) ACEPTADOS sin acción.**
4. **Desplegado y verificado** (ver evidencia abajo). **SPEC-04 CERRADO.**
5. **Refactor de documentación JCC v1.2** (este mismo cierre, a petición del usuario), hecho: la línea "Fase actual" de `CLAUDE.md` (que se había vuelto un changelog append-only de ~7 cambios, ~48 KB) **reducida a un puntero corto** (~1,2 KB) al trabajo activo; **creado el índice global** `docs/cambios/README.md`; **reforzado el bullet "COPILOTO"** (Fase actual se sobrescribe, no acumula); **subida la ruta del doc de metodología** en `CLAUDE.md` a `…_v1_2.md`. Modelo de tres hogares: "Fase actual" = estado vivo corto (se sobrescribe); README por cambio = mapa; `handoffs/` = historia fechada con evidencia; `docs/cambios/README.md` = índice global.

## Qué se verificó CON EVIDENCIA REAL

- **Estático:** `web` build (tsc+vite) + lint (oxlint; solo 3 warnings benignos preexistentes en button/badge/toggle) verdes; `npm test` raíz **14/14** (regresión backend intacta).
- **e2e en navegador** (Browser integrado; backend devBypass + `web` dev + BD local tras `npm run migrate` 006):
  - Parada **externa** (stop del track vía semilla dev `window.__stpCapture`) → banner **Guardar/Descartar** con bytes>0 recuperados (que el banner salga prueba blob>0; renderiza con claves i18n, sin missing-key ni redundancia).
  - **Guardar** → tramo guardado (`POST /api/v1/sessions`→201, `/segments`→200: fachada multipart OK; "Tramo 1"). Con BD pre-migración: banner **Reintentar** reteniendo el blob (cadena de salvaguardas, audio no perdido).
  - Parada **intencional** → **sin** falso positivo + segmento commiteado + transcripción/tramo renderizados.
  - **warm-up** `GET /api/v1/health/db`→200 al montar y al pulsar Grabar; **diagnostics** `POST /api/v1/diagnostics`→200.
  - "Finalizar" navega a `/app/review` con `ActiveSession` poblado.
  - **M2:** track de micro `live→ended` al navegar a Historial grabando (micro liberado). **0 errores de consola**; render OK claro y oscuro.
- **Azure (prod, curl):** `/`→viejo 200; `/app/` + `/app/capture` deep-link→200 sirviendo el **bundle nuevo `index-BDZb5vZS.js` (== build local, confirmado)**; `/api/v1/auth-config`→config MSAL de prod (no devBypass); `/api/v1/health/db`→200 (BD real); `/api/v1/sessions` sin token→401.
- **Smoke logueado del usuario en Azure (21-jul):** login MSAL real → captura por tramos → Finalizar → OK; **probado también en MÓVIL por primera vez — todo correcto.**

## Commits / deploy

- Rama `2b-04-captura` (borrada tras el merge; era local, nunca en origin):
  - `2e59fb1` feat (implementación SPEC-04).
  - `7730c22` fix (correcciones del bucle 3↔4: M1/M2/B3/B4).
- Merge **ff** a `main` (`f1f9d5c → 7730c22`); **deploy GitHub Actions run `29823612793` OK (3m53s; "Build web (Vite)" + "Deploy to Azure Web App" ✓)**.
- Docs post-deploy: `c1dc075` (SPEC-04 desplegado), `1ee2ae9` (SPEC-04 CERRADO). El **refactor de docs v1.2** (esta bitácora + recorte de "Fase actual" + índice global + bump de ruta) es el **commit de cierre de la sesión** (ver `git log` de `main`).
- Sin cambios de config de Azure (SPEC-04 no toca infra). Migración `006` aplicada a la **BD local** durante la verificación (idempotente; prod ya la tenía del ciclo 1).

## Notas de la sesión (releer en frío)

- **Avisos de MCP durante la sesión (sin impacto):** los servidores MCP `mssql-local` y `playwright` aparecieron "Server disconnected". **Ninguno se usó** (la e2e local se hizo con el Browser integrado; el estado de BD, por el backend y `curl`). Nada quedó sin verificar por ello. Si se necesitan en futuras sesiones, reiniciar la app de Claude Code suele reconectarlos.
- **Micro bloqueado en el Browser pane** (limitación del sandbox): la e2e local inyectó un **stub de `getUserMedia`** con audio sintético (oscilador→MediaStreamDestination) para que el `MediaRecorder` real grabara bytes. El micro real lo validó el usuario en su smoke.
- **STT del tono sintético** transcribe como "Gracias por ver el video" (alucinación de Whisper para audio sin voz; ver memoria `project_whisper_silent_audio`) — esperado, no es bug.

## Pendientes heredados / cross-cutting (consolidados aquí para no perderlos al recortar "Fase actual")

- **Node 20 deprecado en el workflow:** `actions/checkout@v4` y `actions/setup-node@v4` van forzados a Node 24; bump menor cuando toque (`.github/workflows/azure-deploy.yml`).
- **`robustez-coldstart-sql` — prueba de fuego §8.3 PENDIENTE** (no es defecto de código): pausar la BD real (`az sql db pause -g rg-speech-to-prompt -s sql-speech-to-prompt -n db-speech-to-prompt`) + smoke logueado (guardar espera y no pierde audio; drive del banner Reintentar). Coordinar ventana con Agustín. Detalle en `docs/cambios/20260710_robustez-coldstart-sql/HANDOFF.md`.
- **Programa (de `HANDOFF-2026-07-18.md`):** RUTA CRÍTICA = burocracia de Partner Center de Agustín (verificación + fiscal + payout, semanas de latencia); ciclo 4 = top-up de investigación Gemini + optimizadores; hueco H6 = `users.email` sigue `NOT NULL` (abordar al retirar la lista blanca en el gate de suscripción del ciclo 3); refinamiento del troceo (Marketplace/Partner Center quizá ciclo propio).
- **`azure-sql-multiusuario` (menores):** añadir la IP de Agustín al firewall de SQL/Storage; limpiar la UI de Ajustes (proveedores legacy) — se resolverá con las pantallas reales de SPEC-06. Ver memoria `project_azure_deployment`.
- **`mejorar-destilado-gpt` (residuo menor opcional):** añadir "prompt" a la corrección de nombres del prompt `completo`.
- **`mejorar-destilado-limpio` (menor):** smoke funcional logueado destilando una sesión larga en `limpio`.

## Cómo retomar (próxima sesión)

1. **Reconciliar:** leer "Fase actual" de `CLAUDE.md` (ahora corta) + esta bitácora + el índice global `docs/cambios/README.md`; confirmar `main` limpio/desplegado y sin ramas pendientes.
2. **Arrancar SPEC-05** con `/jcc-spec`: pantallas reales de Revisión / Destilado / Resultado. Consumen el contexto `ActiveSession` (creado en SPEC-04) y la fachada `getSegmentAudio` (cableada en `client.ts`, aún sin consumir). Reutilizan el contrato `/api/v1` (distill, reprocess, prompts, usage, audio).
3. Seguir: SPEC-06 (Historial/Ajustes reales) → **cutover final** `/app→/`.
