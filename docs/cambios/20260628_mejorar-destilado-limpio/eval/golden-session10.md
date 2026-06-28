# Optimización del modo de destilación "limpio"

En la sesión anterior estuvimos mejorando el plan de destilación en el modo completo. En esta sesión quiero hacer lo mismo pero para el modo limpio.

## Contexto: los modos de destilación

Al principio de la aplicación solo había tres modos: literal, completo y ligero. Posteriormente añadí el modo limpio porque consideré que el modo completo era a veces demasiado agresivo. Preferí meter este modo intermedio, limpio, en el que lo que busco es que el destilado:

- No saque conclusiones ni active un modo de razonamiento al destilar.
- Sea un destilado más fiel a la transcripción, pero ordenándola y dándole estructura.

## El problema que veo con el modo completo en speeches largos

Si el speech es muy largo —porque la funcionalidad que quiero describir es compleja, hablamos de 30, 40 o 50 minutos— un humano, por muy claras que tenga las ideas de principio a fin, es muy posible que la idea que quiere transmitir evolucione durante el speech: hay repeticiones, hay incluso contradicciones a veces involuntarias. O sencillamente el hecho de verbalizar una necesidad hace que las ideas y el planteamiento iniciales se vayan mejorando o cambiando durante el propio speech: ideas que al principio estaban bien, al final han cambiado.

Al principio de la aplicación consideré que un destilado completo era mejor porque te evitaba eso. Pero me di cuenta, usándolo, de que muchas veces el destilado completo omitía detalles e ideas: al compactar tanto, no reflejaba fielmente toda esa disertación de tantos minutos hablando. Por eso el modo limpio se añadió a posteriori.

## Objetivo de esta sesión

Mejorar la optimización del modo limpio, igual que se hizo con el modo completo. Ahora el modelo que hace la destilación es GPT-4.1, así que el prompt tiene que estar diseñado para GPT, sin olvidar que la salida final del prompt va a ser para Claude [inferido: el audio decía "Claudio"].

## Material de prueba / golden

Este speech quizás sería un buen candidato para hacer las pruebas: tiene suficiente longitud como para servir de ejemplo. Lo digo porque no sé si tenemos un speech que nos pueda servir de comparación y de golden, como hicimos con el completo. En la base de datos de transcripción [inferido: el audio decía "base de datos de traducción"], este speech actual es el más largo. Uno que hice ayer, real, puede ser algo más largo también, pero no como este; el de ayer es el ID 9 en la tabla de sesiones.

Por otra parte, en local, en los archivos JSON, es posible que tengamos speeches largos, pero no sé si en modo limpio. Eso habría que mirarlo —es lo que hicimos en la sesión anterior, cuando estuvimos optimizando y comparando el prompt [inferido: el audio decía "PROM"] contra transcripciones destiladas cuando usábamos Claude [inferido: el audio decía "AUNE"].

## Bug a revisar: la grabación se detiene sola

Durante este mismo dictado, la grabación se detuvo sola: no accioné ni interaccioné con la pantalla ni con ningún botón. Se detuvo sola y pasó a ofrecerme el cambio de paso a "revisar y destilar". Lo que hice fue volver a darle al botón de grabar y continuar; supongo que se activó la funcionalidad de tener varios segmentos. Quiero recordar que esto ya me ha pasado alguna otra vez, pero no le di importancia. Deberíamos revisar este problema de que la grabación se pare espontáneamente.

---
## ❓ Preguntas abiertas / supuestos a confirmar
- "Claude" aparece como "Claudio" en la transcripción [inferido]: confirmar que se refiere a Claude.
- "base de datos de transcripción": el audio decía "base de datos de traducción" [inferido]; confirmar a qué base de datos se refiere.
- "prompt" aparece deletreado/distorsionado como "PROM" [inferido]: confirmar.
- "Claude" aparece distorsionado como "AUNE" [inferido]: confirmar que se refiere a Claude.
- ¿La detención espontánea de la grabación es un bug o una funcionalidad prevista? Ya ha ocurrido otras veces.
