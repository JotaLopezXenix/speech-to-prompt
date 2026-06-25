# Flujo 6 — Provisión Azure real + endurecimiento de red/identidad — SPEC técnico

**Fecha:** 2026-06-25
**Tipo:** infraestructura + delta de código menor, sobre el cambio `azure-sql-multiusuario` (rama `feat/azure-sql-multiusuario`).
**Depende de:** [`DESIGN.md`](DESIGN.md) (D2, D3, D11, D12, D13) y los flujos 1-5 ya construidos y verificados en local. Es el **último flujo** de `DESIGN.md §9` (punto 6).

> **Trazabilidad.** Concreta el **flujo 6** de `DESIGN.md §9` y la §6 (acceso administrativo bajo Private Endpoints): provisionar los recursos Azure reales (**Azure SQL + Storage**; hoy solo existe el Azure OpenAI `aoai-speech-to-prompt`) y cerrar el perímetro con **VNet + Private Endpoints + Managed Identity + lista blanca de IPs**, dejando la app **secretless**.

> **Nota de seguridad.** Este documento **no contiene ninguna API key ni secreto**. El objetivo del flujo es precisamente **eliminar los secretos** de App Settings (la app pasa a Managed Identity). Ninguna credencial se escribe en el repo.

> **Forma del entregable (decisión 2026-06-25, revisada en sesión).** Se arrancó con **runbook de portal**; a mitad (tras crear el SQL server + DB a mano y resolver el `az login`) se cambió a **provisión conducida por CLI (`az`)**: Claude ejecuta los comandos y el usuario confirma cada creación/asignación/cierre de red. El usuario es **Owner** de la suscripción `Pay-As-You-Go MSDN -Agus` (crear recursos + asignar roles). Este documento conserva el runbook como referencia del *qué*; el *cómo* pasa a comandos `az` equivalentes.

---

## 1. Objetivo

Que la aplicación, **ya funcional en local**, corra en Azure sobre infraestructura de grado profesional:

1. **Azure SQL Database** (Serverless, auto-pausa — D13) como repositorio real, accedido por la app con **Managed Identity** (sin usuario/contraseña — D3).
2. **Azure Blob Storage** (cuenta + contenedor privado) para el audio, accedido por **Managed Identity** (RBAC, sin claves — D2).
3. **Azure OpenAI** (`aoai-speech-to-prompt`, ya existente) accedido por **Managed Identity** (sin api-key) y tras **Private Endpoint** — alcance ampliado respecto al DESIGN original (ver §2 nota), para **secretless total + un solo perímetro**.
4. **Red cerrada**: VNet + **Private Endpoints** para SQL, Storage y Azure OpenAI; la app los alcanza por **integración VNet** (salida); **acceso administrativo** (SSMS / Storage Explorer) por **lista blanca de IPs** de Jesús y Agustín + auth Entra (D11, D12).
5. **Arranque en blanco**: la BD/Storage de producción arrancan **vacíos** (solo migraciones + `seed-prompts`); **no** se migran datos v1 (decisión 2026-06-25, supera la D15 original).

**Criterio rector:** no cambiar el comportamiento funcional de la app (flujos 1-5 idénticos de cara al usuario); solo cambia *dónde viven los datos* y *cómo se autentica* (de claves a identidad), y *por dónde viaja el tráfico* (de público a privado).

---

## 2. Stack y arquitectura

Stack dado (no se reabre): App Service Linux **B1** Node 24, West Europe, RG `rg-speech-to-prompt`, deploy por GitHub Actions (publish profile) desde `main`; recurso Azure OpenAI `aoai-speech-to-prompt` (West Europe, deployments `whisper` + `gpt-4.1`). Identidad de personas por Easy Auth/Entra (Jesús + Agustín, *assignment required*).

**Hechos verificados en doc de Microsoft (2026-06-25) que sustentan el diseño:**

- **El plan B1 soporta integración regional con VNet** (Basic/Standard/Premium…). **No hace falta subir de plan.** La subred de integración debe ser **/28 o mayor** (recomendado /26), **vacía** y **delegada a `Microsoft.Web/serverFarms`**.
- **SQL + MI**: la app se conecta como **usuario contenido** creado por un **admin Entra** del servidor: `CREATE USER [speech-to-prompt-xenix] FROM EXTERNAL PROVIDER;` + roles. El driver `mssql` ya usa `azure-active-directory-msi-app-service` cuando detecta Azure.
- **Storage + MI**: rol **Storage Blob Data Contributor** a la MI de la app sobre la cuenta. Contenedor privado + RBAC cubre todas las operaciones de datos de la app (put/download/stream/exists/delete).
- **Azure OpenAI + MI**: rol **Cognitive Services OpenAI User** a la MI de la app sobre el recurso AOAI (el código ya pide token con scope `https://cognitiveservices.azure.com/.default`).

**Topología de red (objetivo):**

```
Internet (HTTPS) ── Easy Auth (Entra) ──► App Service  speech-to-prompt-xenix  (sigue público para login)
                                              │  (integración VNet, salida; WEBSITE_VNET_ROUTE_ALL=1)
                                              ▼
                                   VNet  vnet-speech-to-prompt (West Europe)
                                   ├─ snet-appservice   /26  (delegada Microsoft.Web/serverFarms)
                                   └─ snet-privatelink  /27  (NICs de los Private Endpoints)
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
   PE → Azure SQL              PE → Storage (blob)            PE → Azure OpenAI
   privatelink.database.        privatelink.blob.core.        privatelink.openai.
   windows.net                  windows.net                   azure.com
   (auth: MI, usuario           (auth: MI, RBAC               (auth: MI, RBAC
    contenido)                   Blob Data Contributor)        OpenAI User)

   Admin (SSMS / Storage Explorer): lista blanca de IPs de Jesús + Agustín en firewall de SQL y Storage.
```

> **Nota de alcance — AOAI tras Private Endpoint (decisión 2026-06-25).** El DESIGN original (D11) solo exigía Private Endpoint para **SQL y Storage**; el Azure OpenAI se incorporó después (Addendum). Se decide **incluir AOAI** en el endurecimiento (MI + PE) para coherencia "secretless + un perímetro". Implica un **delta de código** en el STT (ver §3.1).

**Identidad de la app:** **Managed Identity asignada por el sistema** (system-assigned) del App Service — una sola identidad, atada al recurso, sin gestión de credenciales. `DefaultAzureCredential` (Storage/AOAI) y `azure-active-directory-msi-app-service` (SQL) la resuelven automáticamente en Azure.

---

## 3. Estructura / Delta

### 3.1 Código — MODIFIED

**(a) `src/providers/stt/azure-whisper.js` — añadir camino Managed Identity (hoy es api-key only).**

Estado actual: el provider **exige** `AZURE_OPENAI_API_KEY` (lanza si falta) y fuerza la cabecera `'api-key'`. Para ser secretless tras el PE de AOAI, debe **autenticar por Entra/MI cuando no hay clave**, igual que ya hace `azure-openai.js`:

- Eliminar el `throw` por ausencia de `this.apiKey`.
- Construir cabeceras con un helper espejo de `AzureOpenAIProvider._authHeaders()`:
  - si `this.apiKey` → `{ 'api-key': this.apiKey }` (preserva el camino local).
  - si no → `Authorization: Bearer <token>` con `new DefaultAzureCredential().getToken('https://cognitiveservices.azure.com/.default')`.
- Aplicar esas cabeceras al `fetch` (sustituye al `headers: { 'api-key': this.apiKey }` fijo de la línea 53), manteniendo intacto el resto (FormData, `verbose_json`, reintento 429, fallback `words[]`).

**(b) `src/services/db.js` — añadir camino Entra para dev (`SQL_AUTH=entra-default`).**

Resuelve el riesgo del DESIGN §11 (la MI no existe fuera de Azure): un desarrollador/admin puede ejecutar `migrate`/`seed-prompts` y depurar contra el **Azure SQL real (Entra-only)** desde su máquina, usando su identidad Entra vía `az login` (`azure-active-directory-default`), **sin secretos**. Opt-in explícito por env var; **no** altera el camino local (SQL auth) ni el de Azure (MI app-service). Necesario porque `seed-prompts` es Node (no SQL puro) y el servidor Azure es Entra-only.

> El resto de proveedores Azure **no cambian**: `azure-openai.js`, `storage/azure.js` y el camino MI de App Service de `db.js` ya estaban escritos; este flujo los **verifica** contra Azure real.

### 3.2 App Settings del App Service — MODIFIED

**Añadir / asegurar:**

| Clave | Valor | Para |
|---|---|---|
| `SQL_SERVER` | `<servidor>.database.windows.net` | capa datos (MI) |
| `SQL_DATABASE` | `db-speech-to-prompt` | capa datos |
| `AZURE_STORAGE_ACCOUNT_URL` | `https://<cuenta>.blob.core.windows.net` | audio (MI) |
| `AZURE_STORAGE_CONTAINER` | `audio` | audio |
| `AZURE_OPENAI_ENDPOINT` | `https://aoai-speech-to-prompt.openai.azure.com` | LLM + STT |
| `LLM_PROVIDER` | `azure-openai` | destilador |
| `LLM_MODEL` | `gpt-4.1` | deployment GPT |
| `STT_PROVIDER` | `azure-whisper` | transcripción |
| `AZURE_OPENAI_STT_DEPLOYMENT` | `whisper` | deployment Whisper |
| `WEBSITE_VNET_ROUTE_ALL` | `1` | fuerza la salida por la VNet (alcanza los PE) |
| `DATA_DIR` | `/home/data` | (sin cambios; config.json/fallback) |

**Eliminar (clave del flujo — secretless):**

- `AZURE_OPENAI_API_KEY` → la app pasa a MI para LLM **y** STT.
- `ANTHROPIC_API_KEY` → Claude está deshabilitado (gating); higiene pendiente.
- `GROQ_API_KEY` → ya no se usa (STT pasa a Azure).
- **No** definir `SQL_USER` / `SQL_PASSWORD` (la presencia de `WEBSITE_HOSTNAME` selecciona MI en `db.js`).

> `STORAGE_PROVIDER` no se fija: la factoría elige `azure` automáticamente por `WEBSITE_HOSTNAME`.

### 3.3 Recursos Azure — ADDED (runbook §)

Nuevos recursos en `rg-speech-to-prompt`, West Europe: **Azure SQL** (servidor lógico + base Serverless), **Storage Account** (+ contenedor `audio`), **VNet** (2 subredes), **3 Private Endpoints** (+ 3 Private DNS zones), **integración VNet** del App Service, y **3 asignaciones RBAC / 1 usuario contenido** para la MI.

---

## 4. Interfaces y contratos

No se introducen interfaces nuevas de aplicación. Contratos relevantes que el flujo debe respetar:

- **`STTProvider.transcribe(audioBuffer, mimeType, model) → { text }`**: la firma y el retorno **no cambian**; solo cambia la autenticación interna. El fallback `text → words[]` se conserva.
- **Selección de auth por entorno (invariante):**
  - SQL (`db.js`): `WEBSITE_HOSTNAME` presente → MI; ausente → SQL auth de `.env`.
  - Storage (`storage/index.js`): `WEBSITE_HOSTNAME` presente → `AzureBlobStore` (MI); ausente → `FileBlobStore`.
  - LLM/STT (`azure-openai.js`/`azure-whisper.js`): `apiKey` presente → api-key; ausente → MI. (En Azure no se define la clave → MI; en local la clave o `az login`.)
- **Usuario contenido SQL** (ejecutado por admin Entra, una vez): 
  ```sql
  CREATE USER [speech-to-prompt-xenix] FROM EXTERNAL PROVIDER;
  ALTER ROLE db_datareader  ADD MEMBER [speech-to-prompt-xenix];
  ALTER ROLE db_datawriter  ADD MEMBER [speech-to-prompt-xenix];
  ALTER ROLE db_ddladmin    ADD MEMBER [speech-to-prompt-xenix];  -- la app aplica migraciones (npm run migrate)
  ```
  El nombre del usuario = nombre del App Service = nombre de la MI system-assigned.
- **RBAC (plano de datos):** MI del App Service →
  - `Storage Blob Data Contributor` sobre la Storage Account.
  - `Cognitive Services OpenAI User` sobre `aoai-speech-to-prompt`.

---

## 5. Qué se PRESERVA (superficie de regresión)

- **Comportamiento funcional de los flujos 1-5**: capturar → transcribir → revisar → destilar (4 modos) → resultado; importar; reprocesar; historial; ajustes. **Idéntico de cara al usuario.**
- **Desarrollo local intacto**: con `.env` (SQL auth + `FileBlobStore` + api-key o `az login`) todo sigue funcionando; ninguna rama de detección de entorno se rompe. El cambio en `azure-whisper.js` **conserva** el camino api-key cuando la clave está presente.
- **Contrato de proveedores** (clases base + factorías) y **contrato de sesión** (segments[] + `transcription_raw`/`edited` materializado): sin cambios.
- **Easy Auth** y el aislamiento por propietario (flujo 2): sin cambios; el login y la identidad siguen igual.
- **Migraciones y `seed-prompts`**: el mismo `npm run migrate` / `npm run seed-prompts` se ejecuta contra la nueva BD (ver §6).

---

## 6. Migración de datos

**No aplica.** La BD y el Storage de producción **arrancan en blanco** (decisión 2026-06-25). El arranque consiste en:

1. `npm run migrate` contra el Azure SQL nuevo (crea esquema 001-004).
2. `npm run seed-prompts` (carga `src/prompts/<familia>/<modo>.md` → `model_prompts`).

Los `data/sessions/*.json` + `data/audio/*.webm` v1 quedan **solo como rescate en disco local**, no se suben.

> Estos dos comandos pueden ejecutarse desde un equipo admin (en la lista blanca de IPs) apuntando al Azure SQL, o desde el propio App Service (consola SSH) tras el despliegue. La MI necesita `db_ddladmin` para `migrate` (ver §4).

---

## 7. Runbook de provisión (portal) — orden con puertas de verificación

> Cada bloque termina con una **comprobación**; no avanzar si falla. El endurecimiento de red (cerrar acceso público) va **al final**, tras verificar que la app funciona por el camino privado.

**A. Identidad de la app**
1. App Service → *Identity* → **System assigned = On**. Anotar el *Object (principal) ID*.

**B. Azure SQL (Serverless, auto-pausa — D13)**
2. Crear **SQL server** lógico `sql-speech-to-prompt` (West Europe) + base `db-speech-to-prompt`, cómputo **Serverless** con **auto-pause** (p. ej. 1 h). Sin acceso público todavía no: dejar "Selected networks" para poder entrar a configurarlo.
3. *Microsoft Entra admin* del servidor = Jesús (o un grupo Entra que incluya a los dos admins).
4. Conectar por SSMS (como admin Entra) y ejecutar el `CREATE USER … FROM EXTERNAL PROVIDER` + roles (§4).
5. App Settings `SQL_SERVER`/`SQL_DATABASE`; **sin** `SQL_USER/PASSWORD`.
   - **Verif.:** desde el App Service (SSH), `npm run migrate` aplica 001-004 sin credenciales (MI). `seed-prompts` carga 8 prompts.

**C. Storage**
6. Crear **Storage Account** (West Europe, LRS, *Hot*); contenedor privado `audio`.
7. *Access Control (IAM)* → asignar **Storage Blob Data Contributor** a la MI del App Service.
8. App Settings `AZURE_STORAGE_ACCOUNT_URL`/`AZURE_STORAGE_CONTAINER=audio`.
   - **Verif.:** grabar un segmento en la app → aparece el blob `<id>__seg-1.webm`; reproducir/reprocesar lee de Storage.

**D. Azure OpenAI a MI**
9. AOAI `aoai-speech-to-prompt` → *Access Control (IAM)* → **Cognitive Services OpenAI User** a la MI del App Service.
10. Adaptar `azure-whisper.js` (§3.1) y desplegar. **Quitar** `AZURE_OPENAI_API_KEY` de App Settings.
    - **Verif.:** destilar (gpt-4.1) y transcribir (whisper) funcionan **sin** api-key (por MI).

**E. Red (VNet + Private Endpoints)**
11. Crear **VNet** `vnet-speech-to-prompt` (p. ej. `10.10.0.0/16`) con subredes `snet-appservice` (`/26`, delegada `Microsoft.Web/serverFarms`) y `snet-privatelink` (`/27`).
12. App Service → *Networking* → **VNet integration** → `snet-appservice`. App Setting `WEBSITE_VNET_ROUTE_ALL=1`.
13. Crear **Private Endpoint** para cada recurso en `snet-privatelink`, con su **Private DNS zone** vinculada a la VNet:
    - SQL → sub-recurso `sqlServer` → `privatelink.database.windows.net`.
    - Storage → sub-recurso `blob` → `privatelink.blob.core.windows.net`.
    - AOAI → `privatelink.openai.azure.com`.
    - **Verif.:** desde SSH del App Service, las tres resoluciones DNS devuelven IP privada (`10.10.x.x`) y la app sigue operativa (los tres `Verif.` anteriores siguen verdes ahora **por el camino privado**).

**F. Cierre del perímetro (lo último)**
14. **AOAI**: *Networking* → **Disabled** (public network access) — solo PE (ningún humano usa el endpoint de datos).
15. **SQL**: *Deny public network access = No* + **firewall**: borrar "Allow Azure services"; dejar **solo** las IPs de Jesús y Agustín (D12). La app entra por PE; los admins por SSMS+IP.
16. **Storage**: *Networking* → **Enabled from selected virtual networks and IP addresses**: añadir la VNet + las IPs de los dos admins (Storage Explorer).
    - **Verif. final (regresión):** ciclo E2E completo desde la URL pública (login Easy Auth → grabar → transcribir → revisar → destilar 4 modos → resultado → historial), y acceso admin SSMS/Storage Explorer desde una IP de la lista; sesiones persisten tras reinicio del App Service.

**G. Despliegue del código**
17. La rama `feat/azure-sql-multiusuario` debe **mergear a `main`** (la CI despliega desde `main`) para que llegue el delta de `azure-whisper.js` y todo el flujo 4. (Paso de proceso; el merge en sí es un PR normal.)

---

## 8. Verificación (end-to-end + regresión)

**Funcional (humo en Azure, por la URL pública):**
- Login Easy Auth cerrado a los dos; cualquier otra cuenta rechazada.
- Grabar por micro (HTTPS) → transcripción correcta (acentos/`LLM` OK, vía Azure Whisper por **MI**).
- Destilar en los **4 modos** (completo/ligero/literal/limpio) con gpt-4.1 por **MI**; editor de system prompt visible/editable.
- Historial y **aislamiento por propietario**: cada admin ve solo lo suyo.
- **Coste/uso**: `usage_events` registra tokens/segundos por sesión.
- Persistencia tras **reinicio** del App Service.

**Secretless (clave del flujo):**
- App Settings **no contienen** `AZURE_OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `SQL_USER`, `SQL_PASSWORD`.
- La app opera con SQL + Storage + AOAI (LLM y STT) **solo por Managed Identity**.

**Red cerrada:**
- SQL/Storage/AOAI sin acceso público para el tráfico de la app (resuelven a IP privada desde el App Service).
- Acceso admin SSMS/Storage Explorer funciona **solo** desde las IPs de la lista blanca; desde otra IP, rechazado.

**Regresión local (no romper el dev):**
- Con `.env` local (SQL auth + `FileBlobStore` + api-key o `az login`), `npm run dev` + ciclo E2E local sigue verde. En particular, el cambio de `azure-whisper.js` **no rompe** la transcripción local por api-key.
- `node --check src/providers/stt/azure-whisper.js` OK; el resto de syntax-checks siguen verdes.

> **Zona sin tests automatizados.** El proyecto no tiene suite de tests; la verificación es **manual guiada** (los pasos de arriba). El único delta de código (`azure-whisper.js`) es pequeño y simétrico a `azure-openai.js`; su prueba real es el humo de transcripción en Azure (paso D) y en local (regresión).

---

## 9. Fuera de alcance

- **Compartir funcional, versionado de texto, rol admin in-app** (siguen diferidos — DESIGN §4.2).
- **VPN punto-a-sitio** (superficie pública cero): se arranca con lista blanca de IPs (D12); la VPN es evolución posterior, no toca datos ni esquema.
- **Política de retención/limpieza** del dato de cliente (pregunta abierta del DESIGN).
- **Scripts IaC** (`az`/Bicep): se hace por runbook de portal (decisión 2026-06-25).
- **ffmpeg en el servidor**: sigue ausente (modo degradado), igual que hoy.
- **Backoffice de edición** de precios/prompts/modelos: siguen editándose por SQL.
- **Migración de datos v1**: no se hace (arranque en blanco — §6).

---

## 10. Riesgos y notas operativas

- **Arranque en frío de Serverless (D13):** la primera conexión tras la auto-pausa puede tardar; `db.js` ya reintenta ante errores transitorios (incluido el "reanudando"). Si molesta en uso interactivo, subir la auto-pause o desactivarla.
- **IPs de admin dinámicas:** la lista blanca (D12) asume IPs estables; una IP doméstica que cambie da fricción de acceso admin → posible empujón anticipado a VPN.
- **Orden importa:** cerrar el acceso público (F) **antes** de verificar el camino privado (E) deja la app sin conectividad. Respetar las puertas de verificación.
- **Propagación RBAC:** las asignaciones de rol pueden tardar minutos en propagar; reintentar el humo si da auth-error inicial.
- **Token MI cacheado:** SQL/AOAI cachean el token; cambios de permisos pueden no verse hasta expirar el token (reiniciar el App Service si hace falta).
- **Merge a `main`:** sin el merge (paso G), el App Service no recibe el delta de `azure-whisper.js` → el STT por MI fallaría (seguiría exigiendo api-key, que ya no está).
