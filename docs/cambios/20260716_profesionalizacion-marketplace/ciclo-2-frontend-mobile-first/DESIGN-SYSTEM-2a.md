# Design System 2a — "B · Papel" (destilado del handoff de Claude Design)

**Origen:** proyecto Claude Design **"Speech-to-prompt. Renovación visual con Claude Design"** (`projectId 76b4739c-0c3f-444a-ad54-94d74e90a572`, del usuario), bajado al repo vía **DesignSync** el 20-jul-2026.
**Snapshots verbatim** (referencia point-in-time): `./diseno-claude-design/` — `Design System.dc.html` + 7 pantallas `.dc.html` + `support.js`.
**Este documento** es la versión legible y durable para construir en **2b**. Ante cualquier duda de valor exacto, manda el `Design System.dc.html`.

> Los `.dc.html` son *Design Components* (HTML con estilos inline, fuentes vía Google Fonts, runtime `support.js`). Son **referencia de composición y estados**, no código de producción. En 2b se **componen los primitivos de shadcn/ui** y se les aplican estos tokens; **no** se copian los primitivos del mockup.

## 1. Tokens de color

### Claro (default)
| Token | Hex | Uso |
|---|---|---|
| `paper` | `#F3EFE7` | fondo de página |
| `surface` | `#FBF8F2` | tarjetas |
| `surface-elevated` | `#FFFFFF` | elementos elevados |
| `ink` | `#201E19` | texto principal |
| `muted` | `#6B6456` | texto secundario |
| `hairline` | `#E7E0D2` | bordes / filetes |
| `accent` | `#2F5D50` | acento (verde pino) |
| `accent-hover` | `#274E43` | hover / activo |
| `accent-soft` | `#E4ECE7` | fondos de acento |
| `success` | `#3E7C58` | éxito (cálido) |
| `warning` | `#B7791F` | aviso (cálido) |
| `error` | `#B4472E` | error (cálido, no rojo de sistema) |

### Oscuro (cálido — solo se redefinen estos; el resto hereda)
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

**Regla:** todo componente lee **tokens**, nunca colores directos. Contraste AA en ambos temas.

## 2. Tipografía (3 roles) — DECIDIDO
- **Display:** **Source Serif 4** (`400/500/600`), fallback `Georgia, serif`. Solo titulares, con contención.
- **Cuerpo / UI:** **system-ui** (`-apple-system, "Segoe UI", Roboto, sans-serif`). Base 15px.
- **Datos / cronómetro:** **IBM Plex Mono** (`400/500`), `font-variant-numeric: tabular-nums`.
- **Escala móvil (px):** 12 · 13 · 15 (base) · 18 · 22 · 28 · 36. Line-height ~1.5–1.6 cuerpo, ~1.1 títulos (`text-wrap: balance`). Labels MAYÚSCULA, tracking ~0.12em.

> **Nota para 2b:** el mockup carga las fuentes por **Google Fonts CDN**. En la app real (PWA, red privada, offline) hay que **auto-hospedarlas** (ambas son OFL, self-hostables) o servirlas vía paquete; no depender del CDN en runtime. Decisión de implementación del SPEC de 2b.

## 3. Espaciado, radios, movimiento
- **Espaciado:** base **4px** → 4 · 8 · 12 · 16 · 24 · 32.
- **Radios:** `input:12px`, `card:14px`, **pill** (999px) para chips, **círculo** para el botón de grabar.
- **Movimiento:** calmado; pulso suave al grabar; transiciones 150–200 ms; respeta `prefers-reduced-motion`.

## 4. Handoff a código (verbatim del bloque "Para Claude Code")

```css
/* globals.css */
:root {
  --paper:#F3EFE7; --surface:#FBF8F2; --surface-elevated:#FFFFFF;
  --ink:#201E19; --muted:#6B6456; --hairline:#E7E0D2;
  --accent:#2F5D50; --accent-hover:#274E43; --accent-soft:#E4ECE7;
  --success:#3E7C58; --warning:#B7791F; --error:#B4472E;
}
.dark {
  --paper:#1C1A16; --surface:#24211C; --surface-elevated:#2C2822;
  --ink:#F1ECE2; --muted:#A79E8D; --hairline:#332F28;
  --accent:#6FB59F; --accent-soft:#22302B;
}
```

```ts
// tailwind.config.ts → theme.extend
colors: {
  paper:'var(--paper)', surface:'var(--surface)',
  'surface-elevated':'var(--surface-elevated)',
  ink:'var(--ink)', muted:'var(--muted)', hairline:'var(--hairline)',
  accent:{ DEFAULT:'var(--accent)', hover:'var(--accent-hover)', soft:'var(--accent-soft)' },
  success:'var(--success)', warning:'var(--warning)', error:'var(--error)',
},
borderRadius:{ input:'12px', card:'14px' },
fontFamily:{
  display:['"Source Serif 4"','Georgia','serif'],
  sans:['system-ui','-apple-system','"Segoe UI"','Roboto','sans-serif'],
  mono:['"IBM Plex Mono"','ui-monospace','monospace'],
}
```

```css
/* Mapeo a los tokens semánticos de shadcn */
--background: var(--paper);        --card: var(--surface-elevated);
--foreground: var(--ink);          --muted-foreground: var(--muted);
--border: var(--hairline);         --input: var(--hairline);
--primary: var(--accent);          --primary-foreground: #FBF8F2;
--ring: var(--accent);
```

## 5. Componentes
- **De shadcn/ui** (componer + aplicar tokens): Button (primario/ghost), Input, Select, Sheet (hoja inferior), Switch/Toggle, Toggle-group (segmented control), Badge.
- **Propios** (no los trae shadcn — ver `Design System.dc.html`): **botón de grabar** (listo/grabando), **chip de tramo** (transcrito ✓ / en vivo), **tarjeta de modo** de destilado (seleccionable), **stepper** (hecho/activo/pendiente), **banner de salvaguarda** (aviso ámbar guardar/descartar), **marca/wordmark + avatar**, **info contextual (i)** que abre hoja inferior (divulgación progresiva).

## 6. Inventario de pantallas + estados (referencia `./diseno-claude-design/*.dc.html`)
| Pantalla | Paso | Estados / notas |
|---|---|---|
| `Login` | — | Logo centrado + titular serif + "Entrar con Microsoft" (SSO) + términos. Estado único. |
| `Captura` | 1 | **4 estados**: Listo (vacío) · Grabando (cronómetro/onda/transcript en vivo) · Transcribiendo (spinner) · **Salvaguarda** (banner ámbar guardar/descartar). + chips de tramo + controles de grabación. |
| `Revision` | 2 | Stepper paso 2; chips de tramo, transcripción **editable** (`contenteditable`), acciones "Añadir tramo" / "Destilar". |
| `Destilado` | 3 | 4 **tarjetas de modo** (Completo/Ligero/Literal/Limpio), toggles rol/restricciones, control segmentado de detalle, **"Destino y formato — Próximamente"** (hueco ciclo 4), hojas inferiores de info (abierta/cerrada). |
| `Resultado` | 4 | Tarjeta del prompt generado + metadatos, **"Coste — Próximamente"** (hueco ciclo 5), botón Copiar con toast "copiado". |
| `Historial` | — | Chips de filtro, sesiones agrupadas (Hoy / Esta semana) con badges de estado (Completado/En destilado/En captura/Borrador), CTA "Nuevo dictado". |
| `Ajustes` | — | Tarjeta de perfil, Proveedores, Preferencias (Idioma, **Tema** segmentado, auto-guardado), Cuenta / Cerrar sesión; estados de tema y toggles. |

**Huecos de ciclos futuros ya representados en el diseño:** ciclo 4 (Destino y formato) y ciclo 5 (Coste), ambos como "Próximamente". Marco (Login/Historial/Ajustes) **incluido** en 2a.

## 7. Qué queda para el SPEC de 2b (no se decide aquí)
- Auto-hospedaje de fuentes (§2 nota).
- Estructura del proyecto Vite + Tailwind + shadcn, build y despliegue en App Service (R5 del ciclo).
- Portado de `audio-recorder.js`/`audio-guards.js`/`diagnostics.js` y **re-expresión de las salvaguardas** (R1, mayor riesgo) — el banner de salvaguarda ya tiene diseño.
- Login MSAL real contra el contrato bearer del ciclo 1; formalizar API (OpenAPI + `/api/v1`).
- i18n dimensionado (strings externalizados, español por defecto).
