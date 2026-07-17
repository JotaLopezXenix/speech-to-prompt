# Investigación — Adaptación del prompt al modelo destino (prompt guides oficiales)

**Para:** ciclo 4 `destilado-destino` del programa `profesionalizacion-marketplace`.
**Origen:** deep-research (fan-out web + verificación adversarial 3 votos + síntesis), 17-jul-2026.
**Cobertura:** 5 ángulos, 21 fuentes, 98 afirmaciones extraídas, 25 verificadas → **24 confirmadas, 1 refutada**, 12 conclusiones tras síntesis.

> **Cómo leer esto:** alimenta el DESIGN del ciclo 4, **no** lo sustituye. Hay huecos importantes (ver §Caveats): **Gemini y los optimizadores oficiales NO quedaron cubiertos** con evidencia verificada. Además la app genera **prompts cortos** (briefs destilados), así que la guía de "contexto largo/RAG" aplica de forma atenuada.

## TL;DR para el diseño

- **Adaptar el prompt al destino es real y accionable**, pero GPT y Claude **convergen más de lo que divergen**: ambos quieren estructura por secciones y aceptan XML o Markdown.
- **La única divergencia dura y accionable** es la **posición de las instrucciones**: GPT las quiere **antes** del contexto (o duplicadas al principio y al final); Claude las quiere **al final**, tras los datos.
- Anthropic avisa de que **el formato exacto (XML vs Markdown) importa cada vez menos** según mejoran los modelos → **no sobre-invertir** en diferenciación frágil de formato.
- **Regla de diseño (objetivo 2):** *fijar por destino* las idiosincrasias del proveedor (delimitadores, posición de instrucciones, roles system/user); *exponer al usuario* los parámetros semánticos que cambian el contenido (densidad, nivel de inferencia, sección de preguntas abiertas, bullets vs prosa, idioma, nº de ejemplos).

## Destino GPT / OpenAI (confianza alta, fuentes primarias)

1. **Estructura y delimitadores:** partir de **Markdown** (títulos de sección hasta H4+) **combinado con etiquetas XML** para envolver bloques de contenido y añadir metadatos. No es "MD o XML": la guía oficial los usa como complementarios. **Evitar JSON** como envoltura de colecciones grandes (rindió especialmente mal).
2. **Plantilla de secciones oficial (ajustable):** Role & Objective → Instructions (subcategorías) → Reasoning Steps → Output Format → Examples → Context. Instrucciones **reutilizables al principio**, contexto variable **al final** (explícitamente por ahorro de prompt-caching).
3. **Obediencia literal:** GPT-4.1 sigue las instrucciones más literalmente que sus predecesores → el prompt debe ser **explícito e inequívoco**; una frase firme suele bastar para corregir desviaciones. (Relevante: **el destilador actual de la app ES gpt-4.1**.)
4. **Posición en contexto largo:** instrucciones al **principio y al final**; si solo una vez, **antes** del contexto. Ante conflicto, GPT-4.1 tiende a obedecer la instrucción **más cercana al final**.
5. **Idiosincrasia intra-OpenAI:** los GPT estándar quieren instrucciones precisas y explícitas; los modelos de **razonamiento (o-series)** quieren prompts **simples, de alto nivel y SIN** "piensa paso a paso" (razonan internamente). → si algún día el destino es un modelo de razonamiento, el prompt óptimo es distinto.
6. **Jerarquía por roles:** tono/rol global en el mensaje **system**; tarea y ejemplos en mensajes **user**. Accionable para dónde poner las instrucciones fijas (system) vs el texto dictado (user).

## Destino Claude / Anthropic (confianza alta, fuentes primarias)

7. **Estructura con etiquetas XML como convención líder:** cada tipo de contenido en su etiqueta (`<instructions>`, `<context>`, `<input>`), nombres descriptivos y consistentes, anidamiento para jerarquía. También admite secciones con encabezados Markdown. Los modelos Claude fueron afinados para prestar atención especial a las etiquetas XML.
8. **Formato de ejemplos:** envolver en `<example>` (varios en `<examples>`); **3-5 ejemplos** para mejores resultados; relevantes, diversos y estructurados.
9. **Multi-documento:** cada documento en `<document>` con subtags `<document_content>` y `<source>`, anidados en `<documents>`. (Menos central para esta app, que no hace RAG multi-doc; informa el patrón de anidamiento.)
10. **Posición en contexto largo (20k+ tokens):** datos largos **arriba**, consulta/instrucciones **al final** (la recall de lo último es la más alta). Anthropic reporta hasta **~30%** de mejora con la query al final (techo autoinformado de pruebas internas).

## Divergencia y síntesis de diseño

11. **Divergencia real (posición de instrucciones):** OpenAI → instrucciones **antes** del contexto (y valora duplicarlas, en parte por prompt-caching); Anthropic → consulta/instrucciones **después** de los documentos. **Ambos coinciden** en que ponerlas al final ayuda. Anthropic añade que el formato exacto probablemente pierde importancia con el tiempo.
12. **Síntesis (qué fijar vs qué exponer):**
    - **FIJAR por destino** (idiosincrasia del proveedor): estilo de delimitadores (GPT: MD-first + XML para bloques; Claude: secciones con XML), plantilla de secciones y roles system/user (GPT), posición de instrucciones (GPT antes/ambos extremos; Claude al final).
    - **EXPONER como ajuste de producto** (independiente del destino): encabezados/secciones on-off, bullets vs prosa, **nivel de inferencia permitido** (encaja con los modos `completo`/`limpio` y la convención `[inferido]` de la app), sección **"❓ Preguntas abiertas"** on-off, longitud/densidad, idioma, nº/formato de ejemplos.

## Caveats (leer antes de fijar defaults)

- **GEMINI/GOOGLE NO CUBIERTO:** cero afirmaciones verificadas sobrevivieron. La app apunta a 3 familias pero este informe solo respalda GPT y Claude. **Antes de implementar el destino Gemini hace falta investigación específica** (ai.google.dev / Vertex AI).
- **OBJETIVO 3 (metaprompting/optimizadores) NO CUBIERTO:** no se verificó nada sobre el "Generate" de OpenAI Playground ni el Prompt Generator/Improver de la Console de Anthropic (existen, pero no verificados aquí). No imitar convenciones sin verificarlas.
- **Sesgo contexto-largo:** buena parte de la guía de posicionamiento está pensada para RAG/20k+ tokens; esta app genera prompts **cortos** → aplica atenuada (informa sobre todo instrucciones-fijas vs texto-dictado).
- **Generalización GPT-4.1 → GPT:** aceptable porque el destilador actual ES gpt-4.1; submodelos de razonamiento requieren otro prompt (ver §5).
- **~30%:** techo autoinformado de pruebas internas de Anthropic, no resultado independiente.
- **Sensibilidad temporal:** guías vigentes a jul-2026 (GPT-4.1, Claude Opus 4.8/Sonnet 5/Fable 5); revalidar antes de fijar defaults.
- **Transparencia (refutado, voto 1-2):** se descartó que la guía de migración de OpenAI recomiende un orden **solo-Markdown sin XML**; lo correcto es MD + XML combinados.

## Preguntas abiertas que hereda el ciclo 4

1. ¿Qué dice la guía **oficial de Gemini** sobre estructura, delimitadores, posición y ejemplos? (hueco crítico)
2. ¿Qué convenciones codifican los **optimizadores oficiales** (OpenAI/Anthropic/Google) y merece imitarlos?
3. ¿La distinción por destino mejora de forma **medible** en prompts CORTOS como los de esta app, o el beneficio se concentra en contexto largo? → mini-eval propia (mismo dictado → prompt por destino → medir output).
4. De los parámetros candidatos a exponer, ¿cuáles cambian de verdad la calidad como para justificar exponerlos vs fijarlos? → validación empírica.

**Recomendación operativa:** en el ciclo 4, antes de tocar la matriz de prompts, lanzar un **top-up de investigación dirigido a Gemini + optimizadores** y una **mini-eval** de destino sobre prompts cortos con el harness `scripts/eval-distill.mjs`.

## Fuentes primarias principales

OpenAI: [GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide) · [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) · [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices) · [Prompting](https://developers.openai.com/api/docs/guides/prompting)
Anthropic: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) · [Use XML tags](https://anthropic.mintlify.app/en/docs/build-with-claude/prompt-engineering/use-xml-tags) · [Long context tips](https://console.anthropic.com/docs/en/build-with-claude/prompt-engineering/long-context-tips) · [Prompting long context](https://www.anthropic.com/news/prompting-long-context) · [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
Comparativa: [arXiv 2411.10541 — Does Prompt Formatting Have Any Impact](https://arxiv.org/abs/2411.10541)
