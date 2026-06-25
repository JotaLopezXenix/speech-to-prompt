# Fase 06 — Provisión Azure + red/identidad (secretless) — IMPLEMENTADA

**Fecha:** 2026-06-25
**Tipo:** implementación del **flujo 6** sobre el SPEC `SPEC-06_red-identidad-provision.md`.
**Estado:** **implementado y verificado E2E en Azure** (https://speech-to-prompt-xenix-…westeurope-01.azurewebsites.net). Cierra el cambio `azure-sql-multiusuario` completo (flujos 1-6).
**Método:** provisión **conducida por `az` CLI** (Claude ejecuta, usuario Owner confirma), no runbook de portal (decisión a mitad de sesión).

---

## Estado metodológico (cierre de sesión 2026-06-25)

- **Fase actual:** **ninguna activa** — el cambio `azure-sql-multiusuario` está **COMPLETO** (flujos 1-6 implementados y verificados). No estamos a mitad de fase, sino en cierre de un cambio terminado.
- **Siguiente command que toca:** **`/jcc-design`** — pero solo cuando se aborde un **trabajo nuevo** (no hay continuación de este cambio). Candidato inmediato: la limpieza de la UI de Ajustes (ver Pendientes §5).
- **Restricciones activas para la próxima sesión:**
  - **Secretless es invariante:** la app en Azure NO debe volver a llevar api-keys en App Settings; SQL/Storage/AOAI van por **Managed Identity**. Los secretos nunca al cliente ni a la BD.
  - **Perímetro cerrado:** no reabrir acceso público de AOAI/Storage; SQL público solo con lista blanca de IPs. La app entra por **Private Endpoint**.
  - **Contrato preservado** (de flujos previos): forma del objeto sesión (`segments[]` + `transcription_raw/edited` materializado), abstracción de proveedores, máquina de 4 fases del front, Easy Auth + aislamiento por propietario.
  - **Dev → Azure:** migrar/seed contra el Azure SQL (Entra-only) se hace con `SQL_AUTH=entra-default` + `az login` (no hay SQL auth en el server Azure).
  - **Pendiente que no se puede "saltar" silenciosamente:** la **UI de Ajustes** muestra proveedores legacy y se auto-abre; es cosmético pero confunde — está flagged como tarea.
- **Evidencia del estado (para reconciliar al arrancar):**
  - **Diseño:** `DESIGN.md` (+ Addendum 2026-06-24). **SPEC:** 01/02/03/05/06 presentes; flujo 4 documentado en bitácora `20260624_Fase_04_Implementada.md`.
  - **Implementado/verificado:** flujos 1-5 (local), flujo 4 commit `e6d9398` tras `/jcc-review` limpio; **flujo 6 verificado E2E en Azure** (esta bitácora, §6).
  - **Git:** todo en `main` (último relevante `806e804`); rama `feat/azure-sql-multiusuario` mergeada; árbol limpio.
  - **Producción:** App Service `speech-to-prompt-xenix` desplegado y funcionando secretless por red privada.
  - **Pendientes menores:** UI Ajustes (chip de tarea creado), IP de Agustín en firewall SQL/Storage.

> **Nota de seguridad.** Sin secretos en el documento. El objetivo del flujo era **eliminar** los secretos: la app ya **no** tiene ninguna api-key en App Settings (solo el secreto propio de Easy Auth, gestionado por Azure). Acceso a SQL/Storage/AOAI por **Managed Identity**.

---

## 1. Resultado

La app pasó de "código nuevo en rama + solo existía el recurso Azure OpenAI" a **producción profesional**: Azure SQL + Blob Storage provisionados, **red privada cerrada** (VNet + 3 Private Endpoints), **Managed Identity** para todo (SQL, Storage, AOAI LLM y STT) y **acceso admin por lista blanca de IPs**. Verificado el ciclo completo (grabar → transcribir → revisar → destilar → historial) con el perímetro cerrado.

---

## 2. Recursos provisionados (as-built, `rg-speech-to-prompt`, West Europe)

- **App Service** `speech-to-prompt-xenix` (B1, existente): **system-assigned MI** (objectId `2990520e-…`, appId `891e014a-…`); **VNet integration** a `snet-appservice`; `WEBSITE_VNET_ROUTE_ALL=1`; App Settings sin claves (cutover MI).
- **Azure SQL** `sql-speech-to-prompt` + base `db-speech-to-prompt`: Serverless GP, **auto-pause 60 min**, 0.5–1 vCore, **Entra-only auth**. Usuario contenido `speech-to-prompt-xenix` (SID = **appId**, roles `db_datareader/datawriter/ddladmin`). Migraciones 001-004 + `seed-prompts` (8 prompts) cargados.
- **Storage** `stspeechtoprompt` (StorageV2, LRS), contenedor privado `audio`; RBAC **Storage Blob Data Contributor** a la MI.
- **Azure OpenAI** `aoai-speech-to-prompt` (existente): RBAC **Cognitive Services OpenAI User** a la MI; deployments `gpt-4.1` + `whisper`.
- **Red:** VNet `vnet-speech-to-prompt` `10.10.0.0/16` → `snet-appservice` /26 (delegada `Microsoft.Web/serverFarms`) + `snet-privatelink` /27. **3 Private Endpoints** (`pe-sql` 10.10.0.68, `pe-blob` 10.10.0.69, `pe-aoai` 10.10.0.70) + **3 Private DNS zones** vinculadas (`database.windows.net`, `blob.core.windows.net`, `openai.azure.com`).
- **Perímetro cerrado:** AOAI público **Disabled**; Storage `defaultAction=Deny` + IP admin `81.33.96.42`; SQL público **abierto pero restringido** a `81.33.96.42` (regla "Jota Casa"). **Pendiente:** añadir la IP de Agustín a SQL y Storage cuando la necesite (2 comandos).

---

## 3. Deltas de código (más allá del SPEC original)

El SPEC preveía 1 delta (`azure-whisper.js`). En la implementación aparecieron **3 más**, todos commiteados:

| Fichero | Cambio | Commit |
|---|---|---|
| `src/providers/stt/azure-whisper.js` | Camino **MI** (era api-key only), espejo de `azure-openai.js` | `81e60ec` |
| `src/services/db.js` | Camino **Entra para dev** (`SQL_AUTH=entra-default`) para migrar/seed contra Azure (Entra-only) desde la máquina del admin | `6deb0bc` |
| `src/routes/transcribe.js` | El route de STT **exigía api-key**; añadida la excepción MI (`sttMI`) como ya hacía `distill.js` (`aoaiMI`) | `29755a9` |
| `src/services/db.js` | **Reintento real** ante cold-start de Serverless: `isTransient` no cazaba "Failed to connect … in 15000ms" (code string `ETIMEOUT`); + `connectionTimeout` 30s | `e0480f4` |

---

## 4. Incidencias resueltas (lecciones / catálogo de regresión)

1. **Usuario MI en SQL — SID por Application ID, no Object ID.** `CREATE USER … FROM EXTERNAL PROVIDER` falló con **Msg 33131 (duplicate display name)** porque Easy Auth crea una app-registration con el **mismo nombre** que la MI. Se creó por SID (`WITH SID=…, TYPE=E`), pero el primer intento usó el **Object ID** → token rechazado ("Login failed for user '\<token-identified principal\>'"). Para identidades de servicio/MI, **Azure SQL mapea por Application (client) ID**. Recalculado el SID desde el appId `891e014a-…` → OK.
2. **STT exigía api-key.** El cutover secretless rompió la transcripción ("Falta la API key del proveedor STT"); el gate del route no contemplaba MI. Arreglado (ver §3).
3. **Cold-start de Serverless.** Tras la auto-pausa, la 1ª conexión fallaba a los 15s y **no se reintentaba** (bug en `isTransient`). Arreglado (ver §3). La 1ª petición tras pausa ahora tarda ~20-40s pero **no falla**.
4. **Proceso Node viejo tras deploy.** Un `restart` manual previo dejó el proceso cargado con código anterior al fix; OneDeploy actualizó el fichero en disco pero hubo que **reiniciar** para que el proceso lo tomara. Lección: tras desplegar un fix, reiniciar y verificar la versión servida (se comprobó vía Kudu VFS).
5. **`az login` caducado.** El token de Azure CLI llevaba >90 días inactivo (AADSTS700082); `az login` lo resolvió. La conexión Entra-dev (token compartido en el perfil) la usa Claude desde su shell.

---

## 5. Pendientes (menores, fuera del núcleo del flujo)

- **Cosmético frontend:** al abrir la URL, el panel de **Ajustes se abre solo** mostrando proveedores **legacy** (Anthropic/Groq/Gemini, "Whisper Large v3", LLM=Anthropic). La UI de Ajustes no se actualizó para el stack Azure/MI; el pipeline funciona (la app no necesita esas claves). Limpieza de UI pendiente (no bloquea).
- **IP de Agustín** en el firewall de SQL y Storage (para su acceso admin SSMS/Storage Explorer). 2 comandos cuando la tenga.
- **`MICROSOFT_PROVIDER_AUTHENTICATION_SECRET`** (Easy Auth) sigue en App Settings — es de Azure, no de la app; rotación gestionada por la plataforma.

---

## 6. Verificación realizada

- Migraciones + seed contra el Azure SQL real (vía Entra-dev): 4 migraciones, 8 prompts, modelos con gating correcto, usuario MI `EXTERNAL_USER`. ✅
- Deploy desde `main` (GitHub Actions, publish profile). ✅
- E2E en navegador (login Easy Auth → grabar → transcribir → revisar → destilar → historial): **secretless (SQL/Storage/STT/LLM por MI) y por red privada**, con perímetro cerrado. ✅
- Cierre de perímetro sin romper la app (PE absorbe el tráfico). ✅
