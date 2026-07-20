# BRIEF para Claude Design — Speech-to-Prompt (Ciclo 2a)

Documento **auto-contenido** para montar el design system y las maquetas en `claude.ai/design`. Decisiones que lo respaldan: `DESIGN-2a.md` (mismo directorio).

> **Cómo usar este brief:** ábrelo en `claude.ai/design`, pégalo como contexto inicial y pide construir **primero los tokens, luego los componentes, luego las pantallas** (orden en §10). Cuando tengas algo, Claude Code lo baja con la herramienta **DesignSync** y lo traduce al frontend real en 2b.

---

## 1. El producto en una frase
**Speech-to-Prompt** convierte **pensamiento hablado** (dictado por tramos, en el móvil) en un **prompt limpio y estructurado** para modelos de IA. Grabas por tramos → revisas la transcripción → la "destilas" en un prompt → copias el resultado.

## 2. Usuario y contexto
- **Profesional técnico individual.**
- **Caso principal de crecimiento: móvil en movimiento** — momentos muertos, andando, a menudo **manos ocupadas y atención parcial**. Diseña para eso: **objetivo táctil grande**, empezar a grabar **sin tener que mirar**, un paso en foco cada vez.
- También **escritorio** (paridad, responsive).
- **Idioma: español por defecto.**

## 3. Personalidad de marca
- **Marca propia** (NO la corporativa de Xenix). Estética de **"producto de IA moderno"**: limpio, mucho aire, calmado, centrado en el contenido.
- **Referencias de tono:** Claude, ChatGPT.
- **Dirección elegida: "B · Papel"** — editorial y humano. **Papel cálido + acento verde pino + serif con contención.** Sensación: *"tus pensamientos hablados, en calma y claros."*
- **Evita** el look genérico de IA: nada de crema+terracota+serif de manual, ni degradado morado-azul, ni emojis como marcadores de sección, ni todo centrado con `rounded-lg` por defecto.

## 4. Design tokens

### 4.1 Paleta — CLARO (default)
| Token | Hex | Uso |
|---|---|---|
| `paper` | `#F3EFE7` | fondo de página |
| `surface` | `#FBF8F2` | tarjetas |
| `surface-elevated` | `#FFFFFF` | elementos elevados |
| `ink` | `#201E19` | texto principal |
| `muted` | `#6B6456` | texto secundario |
| `hairline` | `#E7E0D2` | bordes/filetes |
| `accent` | `#2F5D50` | acento (verde pino) |
| `accent-hover` | `#274E43` | acento hover/activo |
| `accent-soft` | `#E4ECE7` | fondos de acento |
| `success` | `#3E7C58` | éxito (cálido) |
| `warning` | `#B7791F` | aviso (cálido) |
| `error` | `#B4472E` | error (cálido, no rojo de sistema) |

### 4.2 Paleta — OSCURO (cálido, no negro frío)
| Token | Hex |
|---|---|
| `paper` | `#1C1A16` |
| `surface` | `#24211C` |
| `surface-elevated` | `#2C2822` |
| `ink` | `#F1ECE2` |
| `muted` | `#A79E8D` |
| `hairline` | `#332F28` |
| `accent` | `#6FB59F` (pino aclarado para contraste) |
| `accent-soft` | `#22302B` |

> Define la paleta como **custom properties** y redefine solo los tokens en oscuro; los componentes leen tokens, nunca colores directos. Cuida el contraste (AA) en ambos temas.

### 4.3 Tipografía (3 roles)
- **Display** (saludos, títulos de pantalla): **serif con contención** — usa una serif de carácter; Georgia como placeholder si no hay otra. Solo en titulares, no en UI densa.
- **Cuerpo / UI:** **sans humanista** (system-ui / San Francisco / Segoe / Roboto). Legible, neutra, moderna.
- **Datos / cronómetro:** **monoespaciada tabular** (`tabular-nums`).
- **Escala móvil (px):** 12 · 13 · 15 (base) · 18 · 22 · 28 · 36. Line-height ~1.5–1.6 cuerpo, ~1.1 títulos (`text-wrap: balance`). Labels en MAYÚSCULA con tracking ~0.12em.

### 4.4 Forma y movimiento
- **Espaciado:** base 4px (4/8/12/16/24/32).
- **Radios:** 14px tarjetas, 12px inputs, **pills** para chips/segmentos, **círculo** para el botón de grabar.
- **Sombras:** suaves y cálidas (nada duro).
- **Movimiento:** calmado y con propósito — pulso suave del botón al grabar, transiciones 150–200 ms. Respeta `prefers-reduced-motion`. Nada de efectos gratuitos.

## 5. Modelo de navegación
**Flujo guiado fluido:** `Captura → Revisión → Destilado → Resultado`. Un paso en foco cada vez, con **stepper visible**; **ir/volver libre** y **reapertura desde el historial en cualquier paso**. No es un wizard rígido: es un flujo con memoria.

## 6. Pantallas a diseñar (+ estados)
**Capa 1 (corazón):**
- **Captura** — estados: *listo/vacío*, *grabando* (cronómetro + onda + botón activo + lista de tramos + transcript acumulado), *transcribiendo tramo*.
- **Revisión** — transcript editable (merge de tramos).
- **Destilado** — selector de **modo** (completo / ligero / literal / limpio) + **editor de prompt** editable; **deja un hueco visible** rotulado para los futuros controles **destino + formato** (ciclo 4).
- **Resultado** — prompt final + **copiar** + info de uso discreta.

**Capa 2 (marco):**
- **Login** (botón "Entrar con Microsoft", simple), **Historial** (lista de sesiones con estado), **Ajustes** (proveedores/config).

**Shell:** cabecera (wordmark + historial + avatar) + stepper del flujo + hoja/panel deslizante.

**Estados clave transversales:** vacío, cargando/transcribiendo, error, y **banner de salvaguarda**:
- Parada externa de la grabación → *"La grabación se detuvo. ¿Guardar este tramo o descartarlo?"*
- Fallo al subir un tramo → *"No se pudo guardar. Reintentar / Descartar."*

## 7. Inventario de componentes
Wordmark + marca (cuadro de acento con micro) · botón **primario** / **ghost** / **icono** · **botón de grabar** (listo / grabando / pausa) · **stepper** de fases · **chip de tramo** (con "✓ transcrito" / "en vivo") · **tarjeta de transcripción** · **selector de modo** de destilado · **editor de prompt** (con hueco destino+formato) · **banner/toast** (incl. salvaguarda) · **input/select** de ajustes · **item de historial** · **hoja/panel** deslizante · **avatar**.

## 8. Restricciones y "huecos" a anticipar
- **Mobile-first**, **PWA instalable** (sensación de app).
- **Theme-aware**, **default claro**.
- **i18n dimensionado:** strings externalizables, español por defecto (no traducir aún).
- **Dejar hueco visual (no funcional):** destino+formato del destilado (ciclo 4), **costes visibles** (ciclo 5), **acceso a backoffice** (ciclo 6).
- **Botón de grabar:** objetivo táctil grande, alcanzable con una mano, arranque sin exigir mirar la pantalla.

## 9. Salida esperada y handoff
- **Un proyecto de design system** en Claude Design: **tokens** + **componentes** (previews) + **maquetas de pantallas**.
- El stack de **construcción (2b)** es **React + Vite + TypeScript + Tailwind + shadcn/ui (Radix)**. Diseña con esa gramática en mente (escalas tipo Tailwind, componentes tipo shadcn) para que el handoff sea casi 1:1.
- **Claude Code** bajará el proyecto con **DesignSync** (`list_projects` → `list_files` → `get_file`) y lo **traducirá** a componentes React+Tailwind+shadcn en 2b.

## 10. Operativa — Claude Design paso a paso
1. Entra en **`claude.ai/design`** con tu cuenta claude.ai.
2. **Crea un proyecto.** Si te ofrece elegir **tipo "design system"**, elígelo (ese tipo es el que DesignSync sincroniza; es inmutable tras crearlo).
3. **Pega este brief** como contexto inicial.
4. Pide construir en este **orden**: (a) **tokens** (paleta clara+oscura, tipografía, espaciado, radios); (b) **inventario de componentes** (§7); (c) **pantallas** de Capa 1, luego Capa 2 (§6).
5. **Itera conversando**: ajusta acento (prueba pino vs clay/teal/índigo), densidad, tamaños del botón de grabar, etc.
6. Cuando tengas algo, **avísame** (Claude Code): listo tus proyectos con DesignSync, leo los archivos y los traigo/traducimos en 2b.

> **Notas honestas:** la 1ª vez que Claude Code use DesignSync, te pedirá **autorizar el acceso a "design"** en tu login claude.ai (paso normal). El skill companion `/design-sync` (sincronización fina automatizada) **no está confirmado** en la sesión actual; si no estuviera disponible, el handoff se hace por **lectura + traducción manual**, que es perfectamente viable.
