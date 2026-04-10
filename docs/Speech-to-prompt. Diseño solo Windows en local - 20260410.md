# Speech-to-prompt — Diseño solo Windows en local

## Relación con el diseño original

Este documento describe un enfoque simplificado de la herramienta Speech-to-prompt. El diseño completo con despliegue en nube, autenticación, base de datos y soporte móvil está documentado en **"Speech-to-prompt. Análisis y diseño inicial - 20260409.md"**.

Las diferencias clave de este enfoque:

- **Solo local en Windows** (x64 y ARM), sin despliegue en nube.
- **Sin base de datos**: persistencia en ficheros locales.
- **Single-shot**: sin ciclo iterativo de clarificación. Un único paso de destilación.

---

## Resumen ejecutivo

Aplicación local que convierte un speech libre dictado por voz en un prompt optimizado, denso y conciso, listo para pegar en claude.ai o la app de Claude e iniciar una conversación de diseño con Opus en modo extendido y socrático.

Flujo lineal: grabar → transcribir → revisar transcripción → destilar con LLM → revisar prompt → copiar al portapapeles.

---

## Perfil del usuario

Mismo perfil que el documento original: Analista/Developer Senior orientado a Arquitectura de Soluciones de Software, en transición hacia Arquitecto de Soluciones de IA. Idioma de trabajo: español con abundante terminología técnica en inglés, spanglish, siglas deletreadas.

---

## Flujo funcional (single-shot)

### Fase 1 — Captura de audio
- El usuario inicia grabación desde la interfaz.
- Habla libremente, sin límite de tiempo ni estructura impuesta.
- El speech es un volcado mental: ideas paralelas, divagaciones, conceptos incorporados sobre la marcha.

### Fase 2 — Transcripción
- El audio se envía a un servicio de speech-to-text vía API.
- El motor debe manejar bien español con mezcla de inglés, terminología técnica, siglas deletreadas y abreviaturas.
- El resultado es una transcripción literal (texto bruto).

### Fase 3 — Revisión de la transcripción
- El usuario revisa y edita la transcripción bruta.
- Puede eliminar fragmentos irrelevantes (interrupciones, divagaciones sin valor).
- Puede corregir errores de transcripción evidentes.
- Control de calidad imprescindible antes de la destilación.

### Fase 4 — Destilación (single-shot)
- Un LLM recibe la transcripción limpia y la transforma en un prompt optimizado en un único paso.
- El prompt debe ser denso, conciso, coherente y bien redactado.
- No hay ciclo de clarificación. Si el speech tiene ambigüedades, el LLM hace su mejor interpretación y el usuario ajusta en la fase siguiente.
- La herramienta NO da forma a la solución; solo destila el prompt.

### Fase 5 — Resultado
- El usuario revisa el prompt destilado y puede editarlo libremente.
- Copia el prompt al portapapeles.
- La conversación real de diseño comienza a partir de ese prompt.

### Justificación del single-shot

El perfil del usuario produce volcados mentales con contenido sustancialmente completo — el problema es la forma, no la sustancia. El LLM tiene suficiente con una pasada para reestructurar y densificar. Las ambigüedades residuales se resuelven editando el prompt destilado a mano, lo cual es más rápido y simple que un ciclo de clarificación por voz. Esto simplifica significativamente la implementación y la experiencia de uso.

---

## Plataforma y compatibilidad

### Sistemas operativos objetivo
- Windows 11 Pro x64 (portátil principal).
- Windows 11 Home ARM (Surface Pro con Snapdragon X Plus).

### Sugerencia de arquitectura

Aplicación Node.js local que sirve una UI web en localhost, abierta en el navegador del sistema (Chrome/Edge). Esto permite:

- Usar la MediaRecorder API nativa del navegador para captura de audio.
- Compatibilidad x64 y ARM sin esfuerzo adicional (Node.js tiene builds nativos para ambas arquitecturas).
- Sin necesidad de frameworks pesados tipo Electron.
- Experiencia de usuario fluida en el navegador que ya está instalado.

Alternativas a considerar: Electron (más peso, más control), Python + Gradio/Streamlit (más rápido de prototipar, peor UX).

---

## Persistencia sin base de datos

### Sugerencia de estructura

Ficheros JSON en un directorio local del usuario:

```
~/.speech-to-prompt/
  sessions/
    2026-04-10T14-30-00.json
    2026-04-10T16-45-12.json
  config.json
```

### Contenido de cada sesión

```json
{
  "timestamp": "2026-04-10T14:30:00Z",
  "audio_file": "2026-04-10T14-30-00.webm",
  "transcription_raw": "texto bruto de la transcripción...",
  "transcription_edited": "texto editado por el usuario...",
  "prompt_distilled": "prompt destilado final...",
  "llm_provider": "anthropic",
  "llm_model": "claude-sonnet-4-20250514",
  "stt_provider": "groq",
  "stt_model": "whisper-large-v3"
}
```

### Configuración

```json
{
  "api_keys": {
    "anthropic": "sk-...",
    "groq": "gsk_...",
    "google": "..."
  },
  "defaults": {
    "llm_provider": "anthropic",
    "llm_model": "claude-sonnet-4-20250514",
    "stt_provider": "groq",
    "stt_model": "whisper-large-v3"
  }
}
```

Las API keys se almacenan en el fichero de configuración local. Al ser una app exclusivamente local sin exposición a red externa, el riesgo es equivalente al de tener las keys en variables de entorno.

---

## Servicios externos (APIs)

### Speech-to-text
- Sugerencia: Groq API con Whisper large-v3 (tier gratuito, alta velocidad, buena calidad en español con mezcla de inglés).
- Alternativas: OpenAI Whisper API, Deepgram.

### LLM para destilación
- Requisito firme: capa de abstracción agnóstica con adaptadores por proveedor.
- Sugerencia por defecto: Claude Sonnet (buen equilibrio coste/calidad para destilación).
- Otros proveedores configurables: Claude Opus, Gemini.
- El usuario dispone de API key de Anthropic operativa y plan Pro de Gemini.

### Costes
- Objetivo: tender a cero.
- Transcripción en Groq: gratuita en tier free.
- Destilación con Sonnet: céntimos por sesión.

---

## Alcance de la versión 1

### Incluido
- Aplicación local funcional con las 5 fases del flujo single-shot.
- Captura de audio desde navegador via localhost.
- Transcripción con servicio de speech-to-text vía API.
- Revisión y edición de la transcripción bruta.
- Destilación single-shot mediante LLM.
- Revisión y edición del prompt final.
- Copia al portapapeles.
- Configuración de proveedor y modelo (LLM y STT).
- Persistencia de sesiones en ficheros JSON locales.

### Excluido
- Autenticación (innecesaria en local).
- Base de datos.
- Despliegue en nube.
- Soporte móvil/Android.
- Ciclo iterativo de clarificación por voz.

---

## Notas para Claude Code

- Este documento refleja decisiones funcionales del usuario y sugerencias técnicas emergidas durante la conversación de diseño.
- Las referencias a frameworks, servicios y APIs son sugerencias, no decisiones finales. Claude Code debe evaluar cada una y tomar la decisión técnica más adecuada.
- El usuario supervisará el desarrollo pero delega las decisiones de arquitectura y componentes en Claude Code.
- Priorizar soluciones que tiendan a coste cero usando tiers gratuitos.
- La capa de abstracción LLM es un requisito firme.
- La simplicidad del flujo single-shot es una decisión deliberada de diseño, no un recorte provisional.
