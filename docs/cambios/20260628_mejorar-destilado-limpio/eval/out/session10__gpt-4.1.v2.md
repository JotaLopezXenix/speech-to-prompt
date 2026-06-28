# Contexto y retos en la optimización del modo limpio para destilación de transcripciones

## Evolución de los modos en la aplicación

Al principio de la aplicación solo estaban disponibles tres modos de destilación: literal, completo y ligero. Posteriormente añadí el modo limpio porque me di cuenta de que el modo completo era a veces demasiado agresivo, compactando tanto que se perdían detalles importantes. Por eso decidí crear este modo intermedio, el modo limpio, en el que el objetivo es producir un destilado más fiel a la transcripción, sin sacar conclusiones ni activar ningún tipo de razonamiento durante el proceso de destilación, pero sí ordenando y estructurando el contenido.

## Problemas detectados en modo completo

Al usar el modo completo, noté que a menudo se omitían ideas o detalles, especialmente cuando el speech era largo (30, 40, 50 minutos). Es lógico que en transcripciones extensas la idea que se quiere transmitir evolucione durante el speech, haya repeticiones y contradicciones, o simplemente la verbalización de necesidades haga que las ideas iniciales cambien con el tiempo. Esto me llevó a pensar que un destilado demasiado compacto no siempre refleja fielmente todo lo que se ha dicho, por eso el modo limpio se introdujo como alternativa.

## Retos específicos del modo limpio

En esta sesión el objetivo es mejorar la optimización del modo limpio igual que se hizo con el modo completo. Actualmente, el modelo encargado de la destilación es GPT 401, así que debemos diseñar un prompt específico para GPT teniendo en cuenta que la salida final será para Claude [inferido: el audio decía 'Claudio']. Es importante considerar que el modo limpio debe preservar todas las ideas sustantivas y reflejar la evolución del discurso, sin sintetizar ni eliminar información relevante, aunque sea redundante o contradictoria.

## Incidencias técnicas

Durante la grabación de este speech, la grabación se ha detenido espontáneamente. No he interactuado con la pantalla ni ningún botón, pero la aplicación ha pasado a la fase de revisión y destilación. Al notar esto, volví a darle al botón grabar y continué, suponiendo que se activa la funcionalidad de tener varios segmentos. Espero que esto funcione como debería.

Quiero recordar que esta detención espontánea ya me ha ocurrido alguna otra vez, aunque antes no le di importancia. En esta ocasión añado un tercer segmento de manera voluntaria; simplemente para añadir que este speech puede ser un candidato adecuado para las pruebas, ya que tiene suficiente longitud y variedad para servir como ejemplo.

## Criterios para selección de ejemplos y pruebas

No sé si en la base de datos tenemos un speech que pueda servir como comparación o golden para el modo limpio, como hicimos antes con el modo completo. Este speech actual es el más largo, y uno que hice ayer también es extenso, pero no tanto como este; el de ayer tiene el ID 9 en la tabla de sesiones. En local, dentro de los archivos JSON, puede que tengamos speeches largos, pero no estoy seguro de si existen en modo limpio. Eso habría que revisarlo, igual que hicimos en la sesión anterior al optimizar y comparar el prompt [inferido: el audio decía 'PROM'] contra transcripciones destiladas cuando usábamos Claude [inferido: el audio decía 'AUNE'].

---

## ❓ Preguntas abiertas / supuestos a confirmar
- ¿Por qué la grabación se detiene espontáneamente sin interacción? ¿Es un bug o una funcionalidad?
- ¿Está correctamente activada la funcionalidad de múltiples segmentos al grabar en distintos bloques?
- ¿Tenemos en la base de datos o en archivos JSON speeches suficientemente largos en modo limpio como golden para comparar?
- prompt [inferido: el audio decía 'PROM']
- Claude [inferido: el audio decía 'AUNE']
- Claude [inferido: el audio decía 'Claudio']
- [inferido: transcripción dudosa 'los administradores de audio']
