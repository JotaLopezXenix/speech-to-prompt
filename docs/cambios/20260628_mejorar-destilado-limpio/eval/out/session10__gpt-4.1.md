# Contexto y optimización del modo limpio en la destilación de transcripciones

## Evolución de los modos de destilación
- Al principio de la aplicación solo había tres modos: literal, completo y ligero.
- Posteriormente se añadió el modo limpio. La razón fue que el modo completo era a veces demasiado agresivo, por lo que preferí introducir este modo intermedio, donde busco que el destilado no saque conclusiones ni active ningún modo de razonamiento al destilar. El objetivo es un destilado más fiel a la transcripción, pero ordenado y estructurado.
- El modo completo inicialmente parecía mejor porque evitaba contradicciones y repeticiones derivadas de speeches largos y evolutivos. Sin embargo, al usarlo noté que omitía detalles e ideas, y a veces compactaba tanto que no reflejaba fielmente toda la disertación de tantas minutos hablando.
- Por ello se añadió el modo limpio a posteriori.

## Limitaciones y necesidades en discursos largos
- El speech puede ser extenso, de 30, 40, 50 minutos, sobre funcionalidades complejas.
- Es probable que la idea evolucione durante el speech, haya repeticiones, contradicciones, y cambios conforme se verbalizan necesidades.
- Las ideas iniciales pueden cambiar hacia el final del discurso.
- El modo completo evita estos problemas al sintetizar, pero a costa de perder detalles o ideas.
- El modo limpio no debería sacar conclusiones, sino ser más fiel y estructurado respecto a la transcripción.

## Problemas técnicos detectados
- En la grabación, hubo una detención espontánea sin interacción de mi parte. Pasó a la fase de ofrecer cambio de paso para revisar y destilar.
- Al reanudar la grabación, supongo que se activa la funcionalidad de varios segmentos. Espero que sea así.
- Recuerdo que esto ya ha ocurrido antes, aunque no lo había considerado un problema relevante.
- Añadí un tercer segmento de grabación, esta vez voluntariamente, para continuar el speech.

## Consideraciones para optimización y pruebas
- El speech actual es suficientemente largo como para servir de ejemplo o golden en pruebas de optimización de modo limpio, igual que se hizo con el modo completo.
- No sé si hay un speech en modo limpio que sirva de comparación o como golden; esto debería revisarse.
- En la base de datos de traducción, este speech actual es el más largo. El de ayer puede ser algo más largo, pero no tanto como este. El de ayer es el ID 9 en la tabla de sesiones.
- En local, puede haber archivos JSON con speeches largos, pero no sé si hay alguno en modo limpio; habría que verificarlo.
- En la sesión anterior se optimizó y se comparó el PROM contra transcripciones destiladas usando de AUNE.

## Requisitos del prompt y el modelo
- Ahora usamos el modelo GPT 401 para la destilación. Necesitamos un prompt diseñado para GPT.
- La salida del prompt final debe estar destinada para Claude, igual que en el modo completo.

---

## ❓ Preguntas abiertas / supuestos a confirmar
- ¿La funcionalidad de varios segmentos se activa correctamente al reanudar una grabación que se detuvo espontáneamente?
- ¿Por qué se detuvo la grabación sola? ¿Es un problema recurrente o aislado?
- ¿Existe speech suficientemente largo en modo limpio (en base de datos o archivos JSON) que pueda servir como golden para pruebas comparativas?
- ¿El PROM actual para modo limpio está optimizado igual que para el completo?
- ¿Hay que utilizar alguna referencia específica al speech de ayer (ID 9) para la comparación de modo limpio?
- [inferido: modelo GPT 401, el audio decía "GPT en el cuatrocientos uno", confirmar que es GPT-4-01]