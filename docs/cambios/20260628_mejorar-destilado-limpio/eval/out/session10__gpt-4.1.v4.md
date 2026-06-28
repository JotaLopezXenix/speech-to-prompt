# Contexto y evolución de los modos de destilación en la aplicación

## Modos de destilación iniciales y adición del modo limpio
Al principio de la aplicación solo había tres modos de destilación: literal, completo y ligero. Posteriormente añadí el modo limpio porque consideré que el modo completo era demasiado agresivo en algunos casos. Preferí incluir este modo intermedio, donde el objetivo es que el destilado no saque conclusiones ni active un razonamiento al destilar, sino que sea más fiel a la transcripción, simplemente ordenándola y estructurándola.

## Problemática con speeches largos y evolución del pensamiento
Cuando la funcionalidad que quiero describir es compleja, el speech puede durar 30, 40, 50 minutos. En esos casos, aunque tenga las ideas claras, es probable que la idea que quiero transmitir evolucione durante el speech. Puede haber repeticiones, contradicciones involuntarias, o el hecho de verbalizar una necesidad hace que el planteamiento inicial cambie o mejore durante el propio speech. Las ideas que al principio estaban bien, al final pueden haber cambiado.

Al principio consideré que el destilado completo era mejor porque evitaba esos problemas, pero me di cuenta al usarlo que muchas veces omitía detalles e ideas, o se compactaba tanto que no reflejaba fielmente toda la disertación.

## Grabación segmentada y funcionalidades

Durante la grabación, algo ha pasado: se ha detenido sola sin que yo interactuara con la pantalla o algún botón. Automáticamente pasó a la fase que me ofrecía cambiar de paso a revisar y destilar. He vuelto a darle al botón grabar y he continuado. Supongo que se activa la funcionalidad de varios segmentos; espero que sea así.

Al añadir un tercer segmento, esta vez sí ha sido voluntario para volver a grabar. La intención es que este speech largo pueda servir de ejemplo para las pruebas, ya que tiene suficiente longitud. No tengo claro si hay en la base de datos algún speech que nos sirva como comparación o como golden, como hicimos con el modo completo. El speech de ayer puede ser algo más largo; es el ID 9 en la tabla de sesiones. En local, en los archivos JSON, puede haber speeches largos, pero no sé si en modo limpio. Eso habría que revisarlo, igual que hicimos en la sesión anterior cuando optimizamos y comparamos el prompt [inferido: el audio decía 'PROM'] contra transcripciones destiladas cuando usábamos Claude [inferido: el audio decía 'AUNE'].

## Optimización y entorno actual

En esta sesión quiero mejorar la optimización del modo limpio igual que se hizo con el modo completo. Ahora tenemos el modelo GPT-4.1 [inferido: el audio decía 'GPT 401'] para hacer la destilación, así que necesitamos un prompt diseñado para GPT. No hay que olvidar que la salida del prompt final va a ser para Claude [inferido: el audio decía 'Claudio'].

---

## ❓ Preguntas abiertas / supuestos a confirmar
- ¿Se activa realmente la funcionalidad de tener varios segmentos al grabar por partes, como supongo?
- ¿Existe un speech suficientemente largo que sirva como golden para pruebas en modo limpio, tanto en la base de datos como en archivos JSON locales?
- prompt [inferido: el audio decía 'PROM']
- Claude [inferido: el audio decía 'AUNE']
- Claude [inferido: el audio decía 'Claudio']
- GPT-4.1 [inferido: el audio decía 'GPT 401']