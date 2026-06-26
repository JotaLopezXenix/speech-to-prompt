Quiero evaluar si puedo pasar mi fase de análisis y diseño de soluciones desde Claude Chat a Claude Cowork dentro del ecosistema de Anthropic. Llevo varios meses usando Claude, pero no he usado nunca Claude Cowork, y quiero entender si encaja con mi forma de trabajar en proyectos profesionales y personales.

## Mi forma actual de trabajar en Claude Chat

Uso proyectos en Claude Chat para analizar y diseñar soluciones, normalmente para clientes de mi empresa, aunque a veces también para proyectos personales. Mi enfoque es:

- Creo un proyecto.
- En la primera conversación explico el objetivo del proyecto y las necesidades a cubrir.
- Le pido a Claude que adopte un rol socrático, cuestionando supuestos y guiándome con preguntas para avanzar juntos en el análisis.
- Voy iterando conversación a conversación hasta llegar a un diseño suficientemente sólido como para implantarlo.
- Cuando hace falta desarrollo, genero una especificación detallada para que Claude Code se encargue de implementarla.

Trabajo con conversaciones sucesivas porque cuido mucho la ventana de contexto. No quiero saturarla. Cuando una conversación crece demasiado, acordamos generar un documento Markdown con lo tratado, abrir una conversación nueva y continuar desde ahí. Sé que este handoff logic introduce riesgo de perder detalles por consolidación, así que intento minimizarlo. Además, cuando hay temas especializados, los separo en conversaciones específicas, cada una con su propio documento de compactación, mientras mantengo una conversación principal de referencia.

No necesito revisar esa metodología en sí, porque la tengo bastante depurada. Lo que quiero analizar es si puedo trasladarla a Claude Cowork y mejorarla.

## Problemas que he encontrado en los proyectos de Claude Chat

El principal punto conflictivo ha sido el manejo de archivos dentro de los proyectos.

### 1. Problemas de indexación de archivos

Aunque la zona de archivos del proyecto es útil como base de conocimiento compartida entre conversaciones, me he encontrado varias veces con fallos de indexación. Esto además está reportado por Anthropic y por la comunidad.

El problema típico es que aparece el estado de “indexando” durante días y no queda claro:

- si el archivo se ha incorporado bien,
- si no se ha incorporado,
- o qué archivo está causando el bloqueo.

Me ha pasado en varios proyectos. Si has ido subiendo muchos documentos y no detectas en qué momento empezó el problema, luego tienes que ir eliminando archivos uno a uno hasta encontrar cuál lo provoca, y después volver a incorporarlos. Eso hace que la gestión de archivos en proyectos de Chat no me parezca todavía lo bastante robusta para un uso serio en proyectos grandes.

### 2. Incertidumbre sobre acceso directo vs RAG

Además, esos archivos parecen usarse de dos formas distintas según la cantidad acumulada. Por lo que se comenta en la comunidad, y aunque Anthropic no lo documenta con claridad, parece que:

- con menos de unos 12, 13 o 14 documentos, las conversaciones acceden directamente al contenido de los archivos;
- a partir de cierto umbral, el proyecto pasa a usar un RAG interno.

No tengo claro el número exacto ni las condiciones, y eso ya es un problema en sí. Mi preocupación con ese RAG es doble:

- no sé exactamente cuándo entra en juego;
- y mucha gente reporta que la recuperación de información no es fiable.

Entiendo que cualquier RAG implica chunking, indexación semántica y cierto riesgo de pérdida o degradación de información respecto al documento original. No soy experto en ese punto, pero sí veo que hay bastante feedback de la comunidad indicando mala recuperación de información en proyectos con RAG, e incluso creo que hay incidencias registradas por la propia Anthropic.

Para mi caso, esto es crítico porque necesito trazabilidad y precisión en el análisis. No quiero depender de una capa de recuperación que no controlo y cuya activación tampoco tengo clara.

### 3. Pérdida de control sobre los documentos

Otro problema es que, una vez metes los documentos dentro del proyecto, siento que pierdo control sobre ellos. Si algo falla o si necesito rehacer la organización, el proyecto se comporta un poco como una caja negra. No tengo el mismo control que tendría gestionando los documentos directamente como archivos normales bajo mi responsabilidad.

## La alternativa que estoy usando ahora

En mis últimos proyectos he dejado de usar los archivos internos del proyecto como repositorio principal. En vez de eso:

- guardo todos los documentos en una carpeta local de mi equipo;
- esa carpeta actúa como repositorio de trabajo;
- la sincronizo con un repositorio remoto en GitHub.

Así, cuando genero documentos desde una conversación o necesito incorporar documentación externa, los deposito en esa carpeta local y luego hago push o sincronizo con GitHub. Esto me da control total sobre:

- versiones,
- persistencia,
- organización,
- recuperación de documentos.

A cambio, me obliga a gestionar manualmente qué documentos adjunto o incorporo a cada conversación. Aun así, prefiero eso porque sé que, si añado los documentos a una conversación concreta, entran directamente en el contexto y no dependo ni de indexaciones opacas ni de recuperación vía RAG.

De hecho, esta forma de trabajo está bastante alineada con recomendaciones de la propia Anthropic y de parte de la comunidad: usar en cada conversación solo los documentos realmente necesarios para esa interacción.

## Lo que quiero averiguar sobre Claude Cowork

Quiero estudiar si Claude Cowork puede encajar mejor con este flujo y, si es posible, mejorarlo.

### 1. Relación entre Cowork y una carpeta local

Entiendo que Claude Cowork es una parte separada de Claude Chat y Claude Code, con sus propios proyectos independientes, y que parece estar basado o grounded en una carpeta local del equipo. Si eso es así, podría ser una manera mucho más natural de conectar el entorno de trabajo con mi carpeta local, que ya actúa como repositorio documental sincronizado con GitHub.

Lo que necesito entender es:

- si Cowork trabaja realmente sobre una carpeta local como base del proyecto;
- cómo trata los documentos que están en esa carpeta;
- si puedo usar esa carpeta como fuente principal de contexto para mis conversaciones de análisis y diseño.

## 2. Equivalencia entre conversaciones de Chat y conversaciones de Cowork

Mi segunda duda es si una conversación dentro de Claude Cowork tiene las mismas características que una conversación dentro de Claude Chat, o al menos una equivalencia suficiente para mi método de trabajo.

Quiero saber si en Cowork puedo hacer lo mismo que hago hoy en Chat:

- abrir conversaciones dentro de un proyecto;
- analizar un problema de forma progresiva;
- mantener una conversación principal y otras especializadas;
- compactar resultados y continuar en conversaciones nuevas;
- trabajar con el mismo estilo socrático de análisis;
- seleccionar modelos del mismo modo, por ejemplo Opus 4.1 con niveles de esfuerzo como high.

En el fondo, necesito saber si Cowork me sirve como entorno conversacional de análisis y diseño, no solo como algo accesorio o orientado a otro tipo de uso.

## 3. Instrucciones de proyecto en Cowork

Este punto es especialmente importante para mí. En Claude Chat doy muchísimo valor a las project instructions, porque condicionan todas las conversaciones del proyecto y aportan contexto estable. Incluso he creado una skill específica para redactarlas bien.

Necesito saber si los proyectos de Claude Cowork también tienen instrucciones de proyecto equivalentes a las de Chat, y en caso de que sí:

- si funcionan del mismo modo;
- si se inyectan con el mismo peso en cada conversación;
- y si conviene redactarlas con un formato o estructura particular para que Cowork las entienda mejor.

Para mí esto es esencial, porque esas instrucciones son parte central del marco mental del proyecto y de cómo Claude interpreta cada conversación dentro de él.

## 4. Funcionalidades adicionales de Cowork frente a Chat

También quiero entender qué capacidades específicas tiene Cowork que no tenga Chat y que puedan ser útiles en mi forma de trabajar. Por ejemplo, si permite generar o manejar documentos de manera distinta, o si tiene algún tipo de integración con la carpeta local que haga más natural el flujo de análisis, documentación y evolución del proyecto.

## Mi objetivo concreto

Quiero determinar si Claude Cowork puede convertirse en mi entorno principal para análisis y diseño de soluciones, sustituyendo a Claude Chat en esa fase, manteniendo mi método de trabajo por conversaciones sucesivas, pero con una mejor relación con los documentos del proyecto, más control sobre el contexto y menos dependencia de los problemas de indexación y del RAG interno de los proyectos de Chat.