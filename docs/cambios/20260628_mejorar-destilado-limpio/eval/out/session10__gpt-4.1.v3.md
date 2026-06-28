# Contexto y problemas del modo limpio en la aplicación de destilación

## Evolución de los modos de destilación

Al principio de la aplicación solo existían tres modos: literal, completo y ligero. Más adelante añadí el modo limpio porque consideré que el modo completo era a veces demasiado agresivo. Preferí introducir este modo intermedio, el limpio, para obtener un destilado más fiel a la transcripción, pero ordenado y estructurado, sin extraer conclusiones ni activar razonamiento durante el proceso de destilación.

## Problemas detectados en los modos existentes

Cuando el speech es largo, por ejemplo de 30, 40, 50 minutos, incluso aunque el hablante tenga las ideas claras, es muy probable que el mensaje evolucione durante el speech. Suelen ocurrir repeticiones, contradicciones involuntarias, y el hecho mismo de verbalizar puede hacer que el planteamiento inicial cambie o se mejore a medida que avanza el propio speech. Ideas iniciales pueden ser cambiadas al final.

En un principio, pensé que un destilado completo era mejor porque podía evitar estas inconsistencias. Sin embargo, me di cuenta, al usar el modo completo, de que a menudo omitía detalles o ideas. Al compactar tanto, no reflejaba fielmente toda la disertación extensa de tantos minutos hablando. Por eso, el modo limpio se añadió posteriormente.

## Sesión actual: optimización del modo limpio

En esta sesión quiero mejorar la optimización del modo limpio igual que hicimos con el modo completo. Ahora trabajamos con el modelo GPT-4.1 [inferido: el audio decía 'GPT 401'], que es el encargado de la destilación, así que tenemos que diseñar el prompt para GPT. Sin olvidar que la salida del prompt final va a ser para Claude [inferido: el audio decía 'Claudio'].

También deberíamos revisar el problema de la grabación que se ha parado espontáneamente. Esto ya me ha ocurrido alguna otra vez pero no le di importancia. En este caso, la grabación se detuvo sola sin interacción por mi parte y pasó a la fase de revisión y destilación. Reinicié la grabación para continuar, supongo que se activa la funcionalidad de manejar varios segmentos. Espero que efectivamente funcione así.

Añado un tercer segmento de grabación. Esta vez sí ha sido voluntario, para grabar de nuevo. Quiero aclarar que este speech podría funcionar bien como candidato para pruebas, ya que tiene suficiente longitud y contenido como para servir de ejemplo, especialmente si no hay un speech comparable con suficiente extensión para servir de golden, como hicimos con el modo completo.

## Consideraciones sobre la base de datos y archivos locales

En la base de datos de traducción, este speech actual es el más largo, aunque uno que hice ayer podría ser algo más largo también, aunque no tanto como este. El de ayer es el ID 9 en la tabla de sesiones.

En local, en los archivos JSON, puede que haya speeches largos, pero no sé si en modo limpio. Eso deberíamos revisarlo, igual que hicimos en la sesión anterior cuando optimizábamos y comparábamos el prompt [inferido: el audio decía 'PROM'] contra transcripciones destiladas, cuando usábamos Claude [inferido: el audio decía 'AUNE'].

---

## ❓ Preguntas abiertas / supuestos a confirmar
- ¿Qué causa exactamente la detención espontánea de la grabación? ¿Está correctamente implementada la funcionalidad de múltiples segmentos?
- ¿Existe un speech suficientemente largo en modo limpio, comparable y usable como golden, tanto en la base de datos de traducción como en los archivos JSON locales?
- ¿"GPT-4.1" es la versión correcta del modelo? [inferido: el audio decía 'GPT 401']
- ¿Claude es el destino real del prompt final? [inferido: el audio decía 'Claudio']
- "prompt" [inferido: el audio decía 'PROM']
- Claude [inferido: el audio decía 'AUNE']
