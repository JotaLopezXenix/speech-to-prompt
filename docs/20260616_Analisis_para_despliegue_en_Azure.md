# Speech-to-Prompt — Análisis para despliegue en Azure (prueba con socio)

**Fecha:** 2026-06-16
**Versión del producto:** v1.2 (rama `main`, repo `github.com/JotaLopezXenix/speech-to-prompt`) — multi-segmento + fix de acentos de Whisper + modos de destilación.
**Propósito de este documento:** dejar por escrito el enfoque acordado para **publicar la herramienta online y compartirla con el socio** como prueba, **paso previo** a la gran evolución (app móvil + web pública). Es un documento de **decisión y plan**, para arrancar la implementación en una **sesión nueva**. No se ejecuta nada aquí.

> **Trazabilidad.** Continúa y se apoya en:
> - `docs/Speech-to-prompt. Estado actual (as-built) - 20260610.md` (estado del producto y análisis de salto a multiusuario, sección 11).
> - `docs/Speech-to-prompt. Análisis y diseño inicial - 20260409.md` y `… Diseño solo Windows en local - 20260410.md`.

> **Nota de seguridad.** Este documento **no contiene ninguna API key ni secreto**. Las claves seguirán viviendo fuera del repo (en `data/config.json` en local y, en Azure, en **App Settings** / variables de entorno).

---

## 1. Resumen ejecutivo

Se quiere que el **socio pruebe la herramienta** antes de acometer la evolución a producto. Hoy es una app **web local monousuario** (Node + Express, frontend vanilla, datos en ficheros bajo `data/`), sin login ni aislamiento de datos.

Decisión acordada: **publicar UNA sola instancia en Azure App Service**, protegida con la **autenticación integrada de Azure (Easy Auth / Entra ID)** restringida al socio y a ti, con las **API keys como App Settings** y el directorio `data/` en **disco persistente**. Es **online, con login, y casi sin tocar código** — porque Azure aporta la capa de autenticación. El **multiusuario real** (usuarios, datos por usuario, base de datos) **se pospone** a la evolución.

**Idea clave que sustenta la decisión:** "online con login" **no obliga a construir multiusuario**. Easy Auth pone una puerta de login delante de la app actual sin escribir código de auth. La pregunta real no es "¿login sí/no?", sino "¿espacio de trabajo compartido o aislado por persona?", y se decidió **compartido** (es una prueba y se colabora).

**Esfuerzo estimado:** ~1 tarde de cambios de código + configuración del portal de Azure.

---

## 2. Punto de partida (lo que hay hoy)

- **Stack:** Node.js (ESM) + Express; SPA en JS vanilla servida por el propio Express; sin build ni tests.
- **Ejecución actual:** `server.js` escucha en **`127.0.0.1:3000`** (solo localhost), con *single-instance guard*, *fallback* de puerto y **auto-apertura del navegador** (`open`). Pensado para uso local en Windows.
- **IA:** el navegador graba audio (WebM/Opus) → **Groq Whisper** (STT) → **Anthropic Claude** (destilación). Las dos integraciones pasan por clases base de proveedor.
- **Persistencia:** ficheros bajo `data/` (gitignored): `config.json` (claves + defaults), `sessions/<id>.json`, `audio/<id>__seg-N.webm`. Sin base de datos.
- **Claves:** en `data/config.json`, leídas por `src/services/config-store.js`.
- **Rutas de datos:** centralizadas en `src/utils/paths.js` (única fuente de verdad del `data/`).
- **ffmpeg:** **opcional**, con degradación elegante (`src/services/audio-normalize.js`): si está, sanea/comprime/trocea el audio; si no, se envía tal cual.

---

## 3. Decisiones tomadas (sesión 2026-06-16)

| Pregunta | Decisión |
|---|---|
| **Aislamiento** entre socio y tú | **Espacio compartido** (veis las mismas sesiones/audios). → 1 sola instancia. |
| **Claves API / coste** | **Claves corporativas en el servidor** (App Settings). El socio no toca claves. *(Ver aviso 4.1.)* |
| **Vía de acceso** | **Online (solo una URL)**. → Azure. |
| **Sensibilidad de los datos** | **Sí, habrá datos de cliente** (p. ej. CEVA). → acceso cerrado + región adecuada + procesadores conscientes. |

---

## 4. Avisos de precisión (importantes, condicionan el plan)

### 4.1 "Suscripción Team de Claude" ≠ API key de Anthropic

El plan **Team de claude.ai** (asientos de chat) y la **API de Anthropic** (claves programáticas) son **productos distintos con facturación separada**. Esta herramienta llama a la **API**, que requiere una **API key creada en el Anthropic Console** (`console.anthropic.com`), facturada **por uso/créditos**. Los asientos Team **no** habilitan la API.

**Acción pendiente:** confirmar/crear una **API key de la consola de Anthropic** a nombre de la empresa, con presupuesto. Además, la **transcripción usa Groq**, que es **otra key independiente** (no es de Anthropic). Hoy se usa una key personal de Groq; decidir si se mantiene o se saca una corporativa.

### 4.2 Datos de cliente: implicaciones

1. **Cerrar el acceso a vosotros dos**, no a "todo el tenant" ni público. En Entra ID, marcar la *enterprise app* con **"Se requiere asignación de usuario = Sí"** y asignar **solo** las dos cuentas.
2. **Región Azure** acorde a residencia del dato (UE; p. ej. *West Europe* o *Spain Central*).
3. **Procesadores externos:** el audio va a **Groq** y el texto a **Anthropic**. La **API de Anthropic no entrena con tus datos por defecto** y ofrece retención cero; Groq tiene sus propios términos. Para datos de cliente, que sea una **decisión consciente** (revisar términos/DPA). Si es viable, usar material **anonimizado** en la prueba.

---

## 5. Restricción técnica que condiciona el hosting

La grabación por micrófono del navegador (`getUserMedia`) **solo funciona en contexto seguro: HTTPS o localhost**. En HTTP plano **el micro no graba**. Azure App Service sirve **HTTPS por defecto**, así que cumple. (Esto descarta cualquier hosting sin TLS.)

---

## 6. Abanico de opciones evaluadas

| # | Opción | Online | Aislamiento | Login | Esfuerzo | Veredicto |
|---|--------|--------|-------------|-------|----------|-----------|
| 1 | **Túnel** (Cloudflare/ngrok) desde tu máquina | Sí (HTTPS) | Compartido (tu PC) | Password túnel | Minutos | ❌ para datos de cliente (efímero, PC personal). Solo humo no sensible. |
| 2 | **Local / Docker** en máquina del socio | No | Total | — | Bajo | Descartada: se quiere online. |
| 3 | **Azure, 1 instancia + Easy Auth** | Sí | **Compartido** tras login | Gratis (Azure) | Bajo-medio | ✅ **ELEGIDA**. |
| 4 | **Azure, 1 instancia por persona** | Sí | Total | Gratis (Azure) | Medio | Alternativa si se necesitara aislamiento (no es el caso). |
| 5 | **Multiusuario real** | Sí | Total | Propio | Alto | ⏭ Para la gran evolución, no ahora. |

---

## 7. Enfoque elegido — Opción 3 en detalle

```
                 Internet (HTTPS)
                       │
            ┌──────────▼───────────┐
            │  Easy Auth (Entra ID) │  ← login corporativo; solo socio + tú
            │  "asignación requerida"│
            └──────────┬───────────┘
                       │ (ya autenticado)
        ┌──────────────▼───────────────┐
        │  Azure App Service (Linux,    │
        │  Node) — la app TAL CUAL      │
        │  escucha en process.env.PORT  │
        └───┬─────────────┬─────────────┘
            │             │
   App Settings        /home/data (persistente)
  (API keys, DATA_DIR)  config.json + sessions/ + audio/
            │
   Groq Whisper (STT) · Anthropic Claude (destilación)
```

- **Recurso:** App Service Linux con runtime **Node** (la versión que usa el proyecto, ESM ≥20).
- **Login:** Easy Auth con proveedor **Microsoft (Entra ID)**, "requerir autenticación", y **asignación de usuarios obligatoria** limitada a las dos cuentas.
- **Claves:** **App Settings** (variables de entorno), nunca en ficheros del repo.
- **Datos:** `data/` apuntando a **`/home/data`** (en App Service Linux, `/home` es **persistente** y sobrevive a reinicios y despliegues; conviene que esté **fuera de `wwwroot`** para que un redepliegue no lo pise). Alternativa: montar **Azure Files**.
- **Espacio compartido:** ambos veis las mismas sesiones (decisión aceptada).

---

## 8. Cambios de código necesarios (pequeños, conservando el núcleo)

> Todos son aditivos y respetan el comportamiento local actual (si no hay variables de entorno de Azure, todo sigue como hoy).

**8.1 `server.js` — escuchar como un servicio**
- Usar `const port = process.env.PORT || 3000;` (App Service inyecta `PORT`).
- En Azure, escuchar en `0.0.0.0` (no `127.0.0.1`). Detectar entorno por `process.env.WEBSITE_HOSTNAME` (lo define App Service).
- **Saltar las comodidades de local cuando corre en Azure:** el *single-instance guard* (fetch a localhost:3000), el `open(url)` del navegador y el *fallback* de puerto. En Azure basta `app.listen(port)`.

**8.2 `src/utils/paths.js` — `data/` en disco persistente**
- `const DATA_DIR = process.env.DATA_DIR || join(projectRoot, 'data');`
- En Azure se define App Setting `DATA_DIR=/home/data`. En local, sin la variable, sigue usando `data/` del proyecto. Como `paths.js` es la única fuente de rutas, es **un cambio en un sitio**.

**8.3 `src/services/config-store.js` — claves desde entorno**
- Al cargar config, **superponer** las claves desde variables de entorno si existen (p. ej. `ANTHROPIC_API_KEY`, `GROQ_API_KEY`), de modo que en Azure las claves vengan de App Settings y **no** haya que subir `config.json`.
- Mantener `config.json` como *fallback* para uso local. (Decidir si las claves de entorno tienen prioridad sobre el fichero o al revés; recomendado: **entorno gana** en servidor.)

**8.4 ffmpeg (decisión abierta)**
- La imagen Node de App Service **no trae ffmpeg**. Opciones:
  - (a) **Aceptar la degradación** (sin normalización): funciona, pero sin remux (el WebM no lleva duración) ni troceo; riesgo en audios largos / >~25 MB de Groq. Aceptable para una prueba con audios cortos.
  - (b) **Contenedor Docker propio** con ffmpeg instalado (lo más limpio si se quiere la normalización). Implica desplegar como *custom container* en vez de código.
- **Recomendación:** empezar por (a) para la prueba; pasar a (b) si los audios largos dan guerra.

---

## 9. Pasos de despliegue en Azure (guion para la sesión nueva)

1. **Prerrequisitos:** API key de Anthropic (consola), key de Groq, y la suscripción de empresa de Azure. Elegir **región UE**.
2. **Crear App Service** (Plan Linux, runtime Node). Un plan B1/básico sobra para una prueba.
3. **Configurar despliegue:** desde GitHub (`main`) con Deployment Center, o `az webapp up`, o zip-deploy. (Decidir método — ver 11.)
4. **App Settings (variables de entorno):**
   - `ANTHROPIC_API_KEY`, `GROQ_API_KEY` (las corporativas).
   - `DATA_DIR=/home/data`.
   - (Si hiciera falta) `WEBSITE_RUN_FROM_PACKAGE`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true` para que instale dependencias.
5. **Persistencia:** confirmar que `/home` es persistente (lo es en Linux App Service) y que `DATA_DIR` cae ahí. Crear `/home/data` si no existe (la app ya hace `ensureDirectories()`).
6. **Easy Auth:** Authentication → Add identity provider → **Microsoft (Entra ID)** → requerir autenticación. En la *enterprise app* de Entra: **"Se requiere asignación = Sí"** y **asignar solo** las dos cuentas.
7. **Arranque:** comando de inicio `node server.js` (o el `start` de `package.json`). Verificar que escucha en `process.env.PORT`.
8. **Humo:** entrar por la URL (debe pedir login), grabar un audio corto, transcribir, destilar en los 3 modos, comprobar que las sesiones persisten tras un reinicio del App Service.

---

## 10. Lo que NO se hace ahora

- **Multiusuario real** (logins propios, datos por usuario, base de datos): es la gran evolución; hacerlo ahora sería trabajo probablemente desechable dado que está pendiente decidir *evolucionar vs rehacer*.
- **Túnel para datos de cliente:** descartado por efímero y por correr en máquina personal.
- **Rediseño de UI:** aparcado a propósito hasta la evolución (el UI actual es funcional pero mejorable).

---

## 11. Decisiones abiertas para la sesión nueva

1. **Key de Groq corporativa** ¿o se mantiene la personal para la prueba?
2. **Región** exacta (West Europe vs Spain Central) según residencia del dato.
3. **ffmpeg**: degradación (a) vs contenedor (b).
4. **Método de despliegue**: GitHub Actions/Deployment Center vs `az webapp up` vs zip.
5. **Prioridad de claves**: entorno vs `config.json` en servidor.
6. **Material de la prueba**: ¿datos de cliente reales o anonimizados?
7. **Retención/limpieza** de los audios y transcripciones de cliente tras la prueba.

---

## 12. Criterios de aceptación de la prueba

- El socio entra **solo con su cuenta corporativa** (cualquier otra cuenta es rechazada).
- Graba por micrófono (HTTPS OK) y obtiene transcripción correcta (con el fix de acentos vía `words[]`).
- Destila en los **tres modos** (completo/ligero/literal) y puede ver/editar el system prompt.
- Las sesiones y audios **persisten** tras reinicio/redepliegue del App Service.
- Las **claves no están** en el repo ni en los ficheros desplegados (solo en App Settings).
- El consumo de API se carga a la **cuenta corporativa** correcta.
