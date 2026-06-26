Quiero evaluar si puedo pasar de usar Claude en chat a usar Claude Cowork para mi fase de análisis y diseño de soluciones, manteniendo mi metodología actual y, si es posible, mejorándola.

## Contexto de uso actual

Llevo varias semanas usando Claude y el ecosistema de Anthropic, pero hasta ahora nunca he usado Claude Cowork. Voy a empezar a usarlo en algunos proyectos profesionales y quiero analizar si me sirve específicamente para mi forma de analizar y diseñar soluciones.

Mi caso de uso principal es este:

- Inicio un proyecto en Claude.
- En la primera conversación expongo el motivo del proyecto y las necesidades que se quieren cubrir.
- Normalmente son proyectos para clientes de nuestra empresa, aunque también puede haber proyectos personales.
- Mi objetivo es usarlo en proyectos pequeños o medianos y, a partir de ahí, escalar a proyectos grandes.
- En cada proyecto mantengo conversaciones sucesivas con Claude para analizar cada punto.
- Le pido que asuma un rol y un estilo de conversación socrática, cuestionándolo todo y haciéndome preguntas para que avancemos juntos en el análisis hasta llegar a un diseño de solución lo bastante bueno como para implementarlo.
- A veces esa solución requerirá desarrollo por parte de Claude Code; en ese caso necesito generar un documento de especificaciones con todo lo que haya que desarrollar para que Claude Code, como especialista en desarrollo de software, se encargue de ello.

## Mi metodología actual de conversaciones

No quiero rediseñar aquí la metodología en sí, porque ya la tengo bastante depurada. Lo importante es que se entienda cómo trabajo para valorar si Cowork la soporta bien.

Trabajo con conversaciones sucesivas porque soy muy cuidadoso con la ventana de contexto de cada conversación:

- No quiero saturarla.
- Quiero que quepa la conversación con holgura.
- Quiero que todo el contenido relevante entre realmente en contexto.

Cuando alcanzamos un cierto límite, pactado por mí mismo, generamos un documento en formato Markdown con el contenido de esa conversación. Ese documento me sirve para abrir una conversación nueva y fresca basándonos en él.

Sé que ahí existe un problema natural de destilación y de handoff logic: al consolidar una conversación completa en un único documento se pueden perder detalles. Intento mitigarlo siendo cuidadoso, y cuando aparecen conceptos o necesidades que merecen un tratamiento especializado, los separo en conversaciones específicas.

Mi patrón habitual es:

- una conversación principal;
- varias conversaciones adicionales especializadas;
- cada una con su propio documento de compactación;
- y una progresión de análisis que acaba en una conversación final donde se genera el entregable que corresponda.

## Problemas que he encontrado en los proyectos de chat

Lo que quiero estudiar ahora es si Cowork puede sustituir o mejorar mi uso actual de los proyectos de chat para esta fase de análisis y diseño.

En los proyectos de chat, la parte de archivos es cómoda, porque puedo acumular los documentos parciales que se van generando entre conversaciones en la zona de archivos del proyecto. Eso crea una base de conocimiento común para todas las conversaciones del proyecto.

En teoría eso está muy bien porque:

- todas las conversaciones pueden acceder a esos archivos;
- todas quedan conscientes de lo que se ha hablado en el proyecto.

Pero me he encontrado con dos problemas importantes.

### 1) Problemas de indexación de archivos en proyectos

He visto fallos, además reportados por Anthropic y por la comunidad, en la indexación o incorporación de documentos al proyecto.

Me ha pasado en varios proyectos:

- queda el cartel de “indexando”;
- no sabes si el documento se ha incorporado bien, mal o no se ha incorporado;
- tienes que detectarlo tú y resolverlo manualmente.

El problema operativo es serio:

- si has ido metiendo 7, 8 o 9 archivos;
- y no sabes desde cuándo lleva apareciendo ese “indexando”;
- no sabes cuál es el archivo que ha provocado la situación.

Lo que he visto, y no soy el único, es que hay que ir eliminando archivos hasta encontrar el causante, y luego volver a incorporarlos. Mi conclusión práctica es que la gestión de archivos dentro de los proyectos de chat todavía no funciona de forma óptima y tiene fallos.

### 2) Uso de archivos: acceso directo vs RAG implícito

He detectado además un segundo problema relacionado con cómo las conversaciones usan esos archivos.

Parece que, dependiendo del número de documentos en el proyecto, ocurre algo así:

- con menos de unos 12, 13 o 14 documentos, las conversaciones acceden directamente a los documentos o a su contenido completo;
- a partir de ese umbral, el proyecto genera internamente un RAG.

No está bien documentado por Anthropic, y el umbral exacto tampoco está claro. Pero la impresión general es esa.

Cuando entra ese RAG, las conversaciones ya no acceden a los documentos completos, sino a una recuperación por búsqueda sobre una indexación semántica. Asumo que internamente habrá chunking e indexación de trozos, con las pérdidas típicas que eso puede introducir.

Mi problema no es conceptual con el RAG en sí, sino práctico:

- no sé exactamente cuándo está activo;
- sé que hay alguna marca, pero no es transparente;
- no tengo control fino sobre cuándo dejo de trabajar con documentos completos y paso a depender de recuperación semántica.

Además, mucha gente ha reportado mala recuperación de información desde ese RAG de proyectos. Creo que incluso hay incidencias registradas por la propia Anthropic. Si ya cualquier RAG puede perder información según cómo haga el chunking y la recuperación, aquí encima parece que la implementación no está del todo afinada.

Por eso, aunque mis proyectos solían moverse en un número no muy grande de documentos y solo a veces superaban ese umbral, en los últimos proyectos empecé a evitar directamente la característica de archivos en los proyectos.

## Método que estoy usando ahora en lugar de los archivos del proyecto

En mis últimos 2 o 3 proyectos he pasado a otro método, que además he visto que también usa parte de la comunidad.

Ya no guardo los documentos en el proyecto de Claude. En su lugar:

- los guardo en una carpeta local de mi equipo;
- esa carpeta actúa como repositorio local;
- y está sincronizada con un repositorio remoto en GitHub.

Así, cuando genero documentos:

- ya sea dentro de las conversaciones del proyecto;
- o documentos externos que quiero incorporar;

los deposito en mi carpeta local y luego hago push o sincronizo con el repositorio remoto.

Esto me da control absoluto sobre los documentos del proyecto. A cambio es más incómodo, porque dentro de las conversaciones del proyecto tengo que gestionar yo manualmente qué documentos adjunto o uso en cada momento.

Pero esta forma de trabajo tiene una ventaja muy importante: sigo una práctica que también recomienda bastante gente, incluida la línea general que he visto en Anthropic y en la comunidad, que es incorporar en cada conversación —e incluso en cada turno cuando hace falta— los documentos concretos que se van a necesitar. Así sé que esos documentos entran dentro del contexto real de la conversación y no dependo ni de indexaciones dudosas ni de recuperación desde RAG.

Esa es mi forma actual de trabajar.

## Lo que quiero analizar sobre Claude Cowork

Quiero estudiar si Cowork me permite replicar este método de forma más natural y, si es posible, mejorarlo.

### 1) Relación entre Cowork y una carpeta local

Nunca he usado Cowork y entiendo que es un apartado separado dentro de Claude, distinto de chat y de Claude Code.

Mi entendimiento es que:

- Cowork tiene sus propios proyectos;
- esos proyectos son independientes de los proyectos de chat;
- y Cowork funciona basado o enraizado en una carpeta local del equipo, como si estuviera grounded en ella.

Si eso es así, para mí sería muy interesante porque podría enganchar Cowork de forma natural a mi carpeta local, que ya actúa como repositorio de documentos del proyecto y está sincronizada con GitHub.

Lo que necesito entender es:

- si Cowork realmente funciona así;
- cómo trata los documentos que están en esa carpeta local;
- si esos documentos se pueden usar en las conversaciones de Cowork de forma más fácil, más directa o más fiable que en chat;
- y si trabajar sobre esa carpeta local evita los problemas de indexación y de RAG implícito que tengo en los proyectos de chat.

### 2) Equivalencia entre conversaciones de chat y conversaciones de Cowork

También necesito entender si la manera en que Claude actúa dentro de Cowork es idéntica o similar a la manera en que actúa dentro de los proyectos de chat.

Mi duda es si mi sistema de trabajo se puede trasladar tal cual:

- conversaciones sucesivas;
- conversación principal y conversaciones especializadas;
- compactación en Markdown;
- handoff entre conversaciones;
- análisis iterativo;
- diseño de soluciones para clientes.

Quiero saber si una conversación dentro de Cowork tiene las mismas características que una conversación dentro de chat, especialmente para este tipo de trabajo de análisis y diseño.

También quiero confirmar si:

- los modelos disponibles son los mismos;
- puedo seleccionar Opus 4.8;
- puedo usar effort x-high;
- y, en general, si la experiencia de conversación es equivalente en capacidades, control y profundidad.

### 3) Funcionalidades diferenciales de Cowork frente a chat

Además, desconozco qué otras funcionalidades tengo dentro de Cowork que sean distintas de lo que puedo hacer en chat.

Quiero entender qué me aporta Cowork específicamente para este caso de uso. Por ejemplo:

- si puedo generar documentos en distintos formatos;
- si hay mejores mecanismos para trabajar con artefactos del proyecto;
- si la integración con la carpeta local cambia realmente el flujo de trabajo;
- y qué capacidades de Cowork serían relevantes para análisis y diseño, no solo para coding.

### 4) Instrucciones de proyecto en Cowork

Hay un punto especialmente importante para mí: las instrucciones del proyecto.

En chat, las instrucciones del proyecto son críticas en mi forma de trabajar. Les doy muchísima importancia y, de hecho, construí específicamente una skill para generar correctamente las instrucciones de los proyectos.

Quiero saber si los proyectos de Cowork también tienen instrucciones de proyecto como los de chat, y cómo funcionan.

Me interesa entender:

- si existen esas instrucciones;
- si se aplican a todas las conversaciones del proyecto de forma análoga a chat;
- si tienen el mismo peso contextual;
- y si conviene darles un formato, una estructura o una redacción específica para que Claude las interprete mejor en Cowork.

Para mí esto es vital porque en chat esas instrucciones son el contexto permanente que le dice al sistema qué es el proyecto, qué enfoque seguir y cómo debe comportarse dentro de él.

## Lo que quiero obtener de esta conversación

Quiero un análisis comparativo, práctico y profundo entre usar chat y usar Cowork para mi caso de uso concreto: análisis y diseño de soluciones software con conversaciones socráticas, controlando cuidadosamente el contexto, usando documentos Markdown como handoff entre conversaciones y manteniendo mi repositorio documental en local + GitHub.

Quiero que el análisis esté centrado en:

- cómo encaja Cowork con esta metodología;
- qué partes puedo trasladar tal cual;
- qué partes cambian;
- qué limitaciones reales tendría;
- qué ventajas reales tendría frente a chat;
- y si Cowork es una buena evolución de mi flujo actual o no para este tipo de trabajo, no en abstracto sino en este escenario específico.