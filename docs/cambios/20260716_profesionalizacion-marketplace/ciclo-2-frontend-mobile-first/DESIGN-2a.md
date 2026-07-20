# DESIGN — Ciclo 2a `diseño` (frontend-mobile-first)

**Programa:** `profesionalizacion-marketplace` · **Ciclo:** 2 `frontend-mobile-first`.
**Fecha:** 20-jul-2026 · **Fase JCC:** análisis de 2a (este documento la cierra).
**Tipo:** actividad de **diseño** (no toca código). Produce dirección visual + design system + decisiones de UX que alimentan el `/jcc-spec` de **2b**.

> Ver `DESIGN.md` (de este ciclo) para el encuadre completo y las decisiones **estructurales del ciclo** (stack, PWA, cosechar, formalizar API). Ver `../DESIGN.md` para el programa. Este documento **no reemplaza** aquél: añade la capa específica de 2a.

## 0. Relación con el DESIGN del ciclo 2
El DESIGN del ciclo fija el encuadre y lo estructural (React+Vite+TS+Tailwind+shadcn, PWA instalable, móvil = flujo completo, "cosechar" los módulos de captura, formalizar API con OpenAPI + `/api/v1`). **Eso NO se reabre.** Este documento aporta lo que 2a tenía como pregunta abierta: la **dirección visual elegida**, el **design system a nivel de tokens**, el **modelo de navegación** y el **alcance de pantallas**.

## 1. Objetivo y problema
- **Objetivo de 2a:** elegir una dirección visual de nivel producto y definir el design system y el modelo de UX que guiarán la construcción del frontend nuevo (2b), resolviendo la pregunta abierta **wizard-vs-pantalla-única**.
- **Problema:** el frontend actual no tiene identidad ni criterio visual (tokens de tema "claro" bajo un comentario que dice "oscuro"; acento morado sin relación con ninguna marca). Para venderse en el Marketplace necesita una identidad **propia, moderna y coherente** en móvil y web.

## 2. Usuarios y contexto de uso (lo que dirige el diseño)
- **Profesional técnico individual.** Caso de **crecimiento principal = móvil en movimiento** (momentos muertos, andando; a menudo manos ocupadas y atención parcial). Implica: **objetivo táctil grande**, arranque de grabación que **no exija mirar la pantalla**, y **un paso en foco cada vez**.
- **Escritorio:** paridad de flujo, responsive coherente.
- **Idioma:** español por defecto.

## 3. Decisiones acordadas ([E] = estructural / mesa común)
1. **[E] Marca PROPIA, no Xenix.** Identidad propia con estética de **"producto de IA moderno"**. Se **descarta** anclar a la identidad corporativa de `xenix.es` (navy/cian). Referencias de tono: **Claude** y **ChatGPT** (limpio, mucho aire, calmado, centrado en contenido).
2. **[E] Dirección visual = "B · Papel".** Editorial y humano: **papel cálido + acento verde pino + serif con contención**. Elegida por **comparación** entre 3 direcciones sembradas como artifact (20-jul; "A · Señal" instrumento frío / "B · Papel" / "C · Foco" oscuro decidido). El acento exacto es **afinable dentro de la dirección** (pino vs clay/teal/índigo) — a validar en la producción.
3. **[E] Navegación = flujo guiado fluido.** Un paso en foco cada vez (**Captura → Revisión → Destilado → Resultado**), pero **NO rígido**: ir/volver libre + reapertura desde el historial en cualquier paso. **Evoluciona** el wizard actual haciéndolo fluido. **Resuelve** la pregunta abierta wizard-vs-única del programa (§8.1) y del ciclo (§6 Q1). Motivo: encaja con el uso móvil manos-ocupadas y con que el destilado tiene **controles que pesan** (modo + editor de prompt + futuro destino/formato).
4. **Tema = ambos (claro/oscuro), default claro.** Tokens **theme-aware**. Claro por legibilidad al aire libre y alineamiento con Claude/ChatGPT. Oscuro **cálido** (no negro frío), coherente con la dirección.
5. **Nombre en maquetas = "Speech-to-Prompt" (placeholder).** El naming comercial se decide aparte; no bloquea el diseño.
6. **Vía de trabajo de 2a = "siembro + brief".** Claude Code sembró las 3 direcciones (artifacts); el **usuario monta el design system completo + resto de pantallas en Claude Design**; Claude Code **baja** el resultado con la herramienta **DesignSync** y lo traduce en 2b. **Fallback** equivalente: artifacts HTML. Decisión reversible.
7. **Design system (semilla) — tokens.** Detalle completo en `BRIEF-claude-design-2a.md`. Resumen: paleta claro+oscuro (papel/superficie/tinta/filete/**acento pino**/semánticos cálidos); **3 roles tipográficos** (serif *display* con contención / sans humanista *cuerpo-UI* / mono *datos/cronómetro*); escala tipográfica móvil; base de espaciado 4px; radios 14px + pills; movimiento calmado (pulso al grabar, transiciones 150–200 ms, respeta `reduce-motion`).

## 4. Alcance de 2a
**Pantallas a producir** (en Claude Design), por capas:
- **Capa 1 (corazón):** Captura (estados *listo* / *grabando* / *segmentos+transcript*), Revisión, **Destilado** (con **hueco visible** para destino+formato del ciclo 4), Resultado.
- **Capa 2 (marco):** Login (MSAL), Historial, Ajustes.
- **Shell:** cabecera + stepper del flujo guiado + avatar/menú.

**Estados clave cubiertos** (no exhaustivos): vacío, grabando, cargando/transcribiendo, error, y **banner de salvaguarda** (parada externa → "¿Guardar/Descartar tramo?"; fallo de subida → "Reintentar/Descartar").

**Entregable de 2a:** design system (tokens + componentes) + maquetas estáticas + estas decisiones. Es la **entrada del `/jcc-spec` de 2b**.

### FUERA de alcance de 2a
- **Código o prototipo funcional** (eso es 2b).
- **Implementar** destino+formato (ciclo 4), costes (ciclo 5), backoffice (ciclo 6): solo se deja **hueco** visual.
- **Traducciones i18n reales** (se dimensiona estructura; español por defecto).
- Elegir la **serif definitiva** y el micro-tuning tipográfico fino (se cierra en 2b vía `@font-face`).

## 5. Qué se PRESERVA (superficie de regresión) — hereda del ciclo
2a no toca código → **no hay regresión de código**. Pero el diseño **debe contemplar y no romper conceptualmente** (para que 2b lo respete): el **flujo de 4 fases** y el **contrato de sesión**; las **salvaguardas de captura** (no perder audio, banner Reintentar, warm-up, sin falsos positivos) — de ahí que el **banner de salvaguarda** sea un estado clave de las maquetas; **Ajustes** e **Historial**; la **identidad bearer** del ciclo 1. Ver `DESIGN.md` del ciclo §5.

## 6. Supuestos, riesgos y preguntas abiertas
**Supuestos:**
- Claude Design puede producir un proyecto de design system (tokens + componentes/pantallas) **legible por DesignSync**.
- La dirección "B · Papel", sembrada sobre la captura, **escala bien** al resto de pantallas.

**Riesgos:**
- **R-2a.1 (Claude Design beta / primera vez del usuario):** si se atasca, **fallback a artifacts HTML** (previsto).
- **R-2a.2 (handoff Claude Design → repo):** la sincronización fina (skill `/design-sync`) **no está confirmada** en esta sesión; la **herramienta DesignSync sí**. Se verifica al bajar el primer resultado; mientras, lectura + traducción manual a shadcn es viable. La 1ª llamada a DesignSync pedirá **autorizar acceso a design** en el login claude.ai.
- **R-2a.3 (escala de la dirección):** una dirección elegida sobre una sola pantalla puede no cubrir estados densos (destilado). Mitigación: **maquetar el destilado explícitamente** en Capa 1.

**Preguntas abiertas** (se resuelven al producir 2a o en el SPEC de 2b):
- **Acento exacto** de "B · Papel" (pino vs clay/teal/índigo) — afinable en Claude Design.
- **Serif de display** definitiva — 2b.
- **Profundidad de i18n** — dimensionada; la decisión de traducir se liga a ciclo 4/negocio.
- **Orden de integración de ramas** y **build+deploy de Vite** — SPEC de 2b (R2/R5 del ciclo). Nota: el ciclo 1 ya está en `main`, así que 2b se ramifica sobre `main`.

## 7. Siguiente paso
Producir el **design system completo + resto de pantallas** en **Claude Design** (lo conduce el usuario; brief listo en `BRIEF-claude-design-2a.md`; handoff a Claude Code vía DesignSync) — o fallback artifacts. **Cuando el diseño esté completo → `/jcc-spec` del 2b.**
