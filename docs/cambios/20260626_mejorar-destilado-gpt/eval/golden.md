Quiero analizar si Claude.ai Workspaces (Cowork) puede reemplazar o mejorar mi flujo actual de análisis y diseño de soluciones basado en Claude.ai Chat. No busco rediseñar mi metodología de análisis —ya está consolidada— sino entender si Cowork es el entorno adecuado para ejecutarla.

## Mi metodología actual (contexto, no objeto de revisión)

- Proyecto en Claude Chat → primera conversación establece contexto y necesidades del cliente.
- Claude asume rol socrático: cuestiona, pregunta, co-construye el análisis.
- Cuando el contexto se acerca al límite, consolido la conversación en un documento Markdown y abro una conversación nueva con ese documento como base (handoff controlado, con pérdida mínima aceptada).
- Conversaciones paralelas especializadas cuando el análisis lo requiere; cada una genera su propio documento.
- Conversación final produce el artefacto de salida (especificación para Claude Code u otro entregable).

## Problema con archivos en proyectos de Chat

- Los archivos del proyecto actúan como base de conocimiento compartida entre conversaciones, pero presentan dos fallos críticos:
  1. **Bug de indexación** (reconocido por Anthropic): estado "indexando" indefinido; imposible saber qué archivo lo causa sin eliminarlos uno a uno.
  2. **RAG no documentado ni controlable**: por encima de ~12-14 archivos (umbral no publicado por Anthropic), el proyecto genera automáticamente un RAG. Las conversaciones dejan de acceder al contenido completo y pasan a búsqueda semántica sobre ese RAG. La comunidad reporta recuperación deficiente. Se puede saber cuándo está activo, pero no se avisa de manera clara.
  3. **Pérdida de control sobre los archivos**: una vez cargados, no hay gestión real (sin versiones, sin recuperación fiable si se borran).

## Mi solución actual

- No uso la zona de archivos del proyecto.
- Mantengo los documentos en una carpeta local sincronizada con un repositorio remoto en GitHub.
- En cada conversación, cargo manualmente los documentos necesarios en ese turno → entran directamente en el contexto, sin RAG ni incertidumbre de recuperación.

## Lo que desconozco de Cowork y necesito entender

1. **Grounding en carpeta local:** ¿Cowork funciona necesariamente enraizado en una carpeta local del equipo? Si es así, ¿cómo trata esos archivos en las conversaciones? ¿Acceso directo al contenido completo, o genera algún tipo de índice/RAG propio?

2. **Equivalencia conversacional con Chat:** ¿Una conversación dentro de Cowork tiene las mismas capacidades que una de Chat? Específicamente: selección de modelo (ej. Claude Opus con extended thinking), gestión de ventana de contexto, modo socrático, generación de artefactos Markdown. Mi método depende de estas capacidades intactas.

3. **Instrucciones de proyecto:** ¿Los proyectos de Cowork tienen un equivalente a las instrucciones de proyecto de Chat? Las instrucciones son un elemento crítico en mi flujo —construí una skill específica para generarlas correctamente—. Necesito saber si existen en Cowork, cómo se estructuran, y si hay consideraciones de formato para que el modelo las procese de forma óptima.

4. **Funcionalidades diferenciales de Cowork:** ¿Qué capacidades tiene Cowork que no existen en Chat y que podrían ser relevantes para análisis y diseño de soluciones (no para desarrollo de código)?