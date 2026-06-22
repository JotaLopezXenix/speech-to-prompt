# Speech-to-prompt

## Resumen ejecutivo

Herramienta web que convierte un speech libre y extenso (dictado por voz) en un prompt optimizado, denso y conciso, listo para iniciar una conversación de diseño con Claude Opus en modo extendido y socrático.

El usuario habla sin restricciones de estructura ni tiempo, volcando todas sus ideas sobre un tema que quiere tratar con Claude. La herramienta transcribe, permite revisar, destila mediante LLM y entrega un prompt pulido que el usuario pega en claude.ai o la app de Claude para iniciar la conversación real.

---

## Perfil del usuario

- Analista/Developer Senior orientado a Arquitectura de Soluciones de Software.
- En transición activa hacia Arquitecto de Soluciones de IA, con foco en agentes IA y sistemas agentic complejos.
- Se apoya principalmente en el ecosistema Anthropic (Claude, Claude Code, API) para analizar y diseñar soluciones basadas en IA.
- Idioma de trabajo: español con abundante terminología técnica en inglés, spanglish, abreviaturas y siglas deletreadas (ejemplo: dice "ele ele eme" y debe convertirse en "LLM").

---

## Problema que resuelve

El usuario necesita transmitir ideas complejas a Claude como punto de partida de conversaciones de diseño. Escribir estas especificaciones iniciales es lento y limita el flujo de pensamiento. Dictarlas es más natural, pero las herramientas de dictado existentes (Windows Voice Typing, Microsoft 365 Dictate, Wispr Flow) presentan limitaciones:

- Errores de puntuación y segmentación de frases.
- Mal manejo de terminología técnica mixta español/inglés.
- No convierten un speech desestructurado en un prompt optimizado.

La herramienta no analiza, diseña ni desarrolla soluciones. Su único trabajo es transformar un volcado mental hablado en un prompt bien formulado para que Claude lo use como punto de partida.

---

## Flujo funcional

### Fase 1 — Captura de audio
- El usuario inicia una grabación desde el navegador.
- Habla libremente, sin límite de tiempo, sin estructura impuesta.
- El speech será un volcado de ideas sin mucho control: pensamientos paralelos, divagaciones, incorporación de conceptos sobre la marcha.
- El audio se envía al backend para su procesamiento.

### Fase 2 — Transcripción
- El audio se procesa mediante un servicio de speech-to-text.
- El motor debe manejar bien español con mezcla de inglés, terminología técnica, siglas deletreadas y abreviaturas.
- El resultado es un texto bruto (transcripción literal).

### Fase 3 — Revisión de la transcripción
- El usuario revisa la transcripción bruta antes de que se procese.
- Puede eliminar fragmentos irrelevantes (ejemplo: una llamada telefónica que interrumpió la grabación).
- Puede corregir errores evidentes.
- Esta fase es imprescindible como control de calidad antes de la destilación.

### Fase 4 — Destilación
- Un LLM recibe la transcripción limpia y la transforma en un prompt optimizado.
- El prompt debe ser denso, conciso, coherente y bien redactado.
- Si el LLM no entiende algo o detecta ambigüedades, inicia un mini-diálogo de clarificación con el usuario.
- Las respuestas de clarificación se hacen por voz (se transcriben igual que el speech original).
- El ciclo de clarificación itera hasta que el LLM tiene suficiente contexto para generar el prompt final.
- La herramienta NO debe dar forma a la solución que el usuario quiere atacar. Solo destila el prompt.

### Fase 5 — Resultado
- El usuario revisa el prompt destilado y puede editarlo si es necesario.
- Copia el prompt al portapapeles para pegarlo en claude.ai o la app de Claude.
- La conversación real de diseño (con Opus en modo extendido y socrático) comienza a partir de ese prompt.

---

## Contexto de uso del prompt generado

- El prompt se usará como inicio de conversaciones profundas con Claude Opus en modo extendido.
- En esas conversaciones, el usuario emplea un modo socrático para ir puliendo y desarrollando las ideas iniciales.
- Por tanto, el prompt no necesita ser exhaustivo; necesita ser preciso y denso para que Opus tenga un buen punto de partida desde el que desplegar el análisis.

---

## Requisitos técnicos

### Plataforma
- Aplicación web accesible desde navegador.
- Debe funcionar en:
  - Windows 11 Pro (x86, portátil principal).
  - Windows 11 Home ARM (Surface Pro con Snapdragon X Plus).
  - Android (móvil, Chrome).
- La versión web resuelve la compatibilidad multiplataforma de forma nativa.

### Entorno de uso habitual
- Escritorio en casa, entorno silencioso, usuario solo.
- Sin ruido de fondo ni preocupaciones de privacidad por hablar en voz alta.

### Autenticación
- Sign-in con Google.
- Necesario para proteger el acceso y evitar consumo de API por terceros.

### LLM — Agnóstico
- La arquitectura debe ser agnóstica en cuanto al LLM utilizado para la destilación.
- Sugerencia de diseño: implementar una capa de abstracción con adaptadores por proveedor.
- LLM por defecto sugerido: Claude Sonnet (buen equilibrio coste/calidad para la tarea de destilación).
- Otros LLMs que el usuario quiere poder configurar: Claude Opus, Gemini.
- El usuario dispone de API key de Anthropic operativa y plan Pro de Gemini.

### Speech-to-text
- El motor de transcripción debe tener alta calidad en español con mezcla de inglés y terminología técnica.
- Sugerencia de diseño: Whisper large-v3 a través de Groq API (tier gratuito, alta velocidad, misma calidad que OpenAI Whisper).
- Alternativas a considerar: OpenAI Whisper API ($0.006/min), Deepgram (tier gratuito disponible).

### Costes
- Objetivo: tender a cero. Máximo aceptable: 5-10 €/mes.
- Priorizar capas gratuitas en todos los servicios.
- El único coste significativo esperado son las llamadas a la API del LLM para destilación, que con Sonnet deberían ser céntimos por sesión.

---

## Sugerencias de arquitectura

Las siguientes son sugerencias derivadas de la conversación de diseño inicial. Claude Code tomará las decisiones técnicas finales.

### Frontend
- Sugerencia: aplicación Next.js desplegada en Vercel (tier gratuito).
- La captura de audio podría usar la MediaRecorder API nativa del navegador, que funciona en Chrome en todas las plataformas objetivo.
- SPA con las fases del flujo funcional como vistas o pasos.

### Backend y servicios
- Sugerencia: Supabase como plataforma backend (tier gratuito), que ofrece:
  - Autenticación con Google integrada.
  - Base de datos PostgreSQL para almacenar transcripciones y prompts.
  - Storage para archivos de audio.
  - Edge Functions como orquestador de llamadas a APIs externas (speech-to-text, LLM).
- Las API keys deben mantenerse en el servidor; nunca exponerlas en el frontend.

### Transcripción
- Sugerencia: Groq API con modelo Whisper large-v3.
- Justificación: tier gratuito generoso, velocidad muy alta, misma calidad que OpenAI Whisper, buen soporte de español con terminología en inglés.
- El formato de audio a enviar deberá optimizarse para el servicio elegido.

### Capa LLM
- Sugerencia: interfaz común con adaptadores por proveedor (Anthropic, Google, etc.).
- Cada adaptador traduce las llamadas al formato de API del proveedor correspondiente.
- Configuración de proveedor y modelo seleccionable desde la UI.
- Sonnet como default; Opus y Gemini como opciones configurables.

### Despliegue
- Sugerencia: Vercel para el frontend, Supabase para backend/auth/DB/storage.
- El usuario tiene experiencia previa desplegando en ambas plataformas.

---

## Confidencialidad y privacidad

### API de Anthropic
- Los inputs y outputs de la API se borran automáticamente tras 7 días.
- No se usan para entrenar modelos.
- La destilación del prompt (donde va el contenido más sensible) pasa por la API, que es la capa más protegida.

### Planes de consumo (claude.ai)
- Las conversaciones en planes Free, Pro y Max pueden usarse para entrenamiento a menos que se haga opt-out en Privacy Settings.
- Esto afecta a la conversación final en claude.ai, no a la herramienta en sí.
- Mitigación: opt-out del toggle "Improve Claude" o uso de modo incógnito para temas sensibles.

### Transcripción (speech-to-text)
- Revisar la política de privacidad del proveedor de transcripción elegido antes de implementar.
- El audio puede contener datos confidenciales de proyectos de clientes.

### Nota importante
- El usuario puede tener contratos de confidencialidad con sus clientes.
- Aunque la herramienta en sí usa APIs protegidas, el usuario es consciente de que la conversación final en claude.ai (plan Max) tiene un nivel de protección diferente al de las APIs comerciales.

---

## Alcance de la versión 1

### Incluido
- Aplicación web funcional con las 5 fases del flujo.
- Captura de audio desde navegador (escritorio).
- Transcripción con servicio de speech-to-text de alta calidad.
- Revisión y edición de la transcripción bruta.
- Destilación mediante LLM con mini-diálogo de clarificación por voz.
- Revisión del prompt final y copia al portapapeles.
- Autenticación con Google.
- Configuración de proveedor y modelo LLM.



---

## Notas para Claude Code

- Este documento refleja las decisiones funcionales del usuario y sugerencias técnicas derivadas de una conversación de diseño inicial.
- Las referencias técnicas (frameworks, servicios, APIs) son sugerencias, no decisiones finales. Claude Code debe evaluar cada una y tomar la decisión técnica más adecuada.
- El usuario supervisará el desarrollo pero delega las decisiones de arquitectura, plataformas y componentes en Claude Code.
- Priorizar soluciones que tiendan a coste cero usando tiers gratuitos.
- La capa de abstracción LLM es un requisito firme: la herramienta debe poder cambiar de proveedor/modelo sin reescribir.
