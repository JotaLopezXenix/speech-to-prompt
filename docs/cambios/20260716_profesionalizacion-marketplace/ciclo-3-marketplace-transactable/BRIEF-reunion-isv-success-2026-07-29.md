# Brief — 2ª reunión Microsoft ISV Success · seguimiento técnico

**Cuándo:** miércoles **29-jul-2026, 15:30**. **Con:** Marcelo Miranda (consultor técnico de partners) y equipo.
**Antecedente:** [`BRIEF-reunion-isv-success-2026-07-23.md`](BRIEF-reunion-isv-success-2026-07-23.md) (§6 = notas de la 1ª sesión, volcadas de la transcripción).

> **Encuadre.** La primera fue *Discovery and Planning*: Microsoft escuchó y encuadró, y solo se abordaron 2 de las 12 preguntas. Agustín cerró pidiendo seguimiento *"cuando nos vayamos encontrando dudas al hacer la configuración técnica"* — así que **esta sesión debería ser la técnica**. Conviene decirlo al abrir, para que venga con el perfil adecuado (o con un arquitecto, que ya ofrecieron).

## 1. Qué ha cambiado desde el 23-jul (contexto de 1 minuto)

- **SPEC-01 desplegado en producción**: el acceso a la app ya lo gobierna un modelo de *entitlements* (suscripción de Marketplace o concesión manual), no una lista blanca de correos. El hueco por el que enchufar la suscripción **ya está construido**.
- **SPEC-02 especificado** (cliente de fulfillment secretless): app de Entra dedicada + credencial federada sobre Managed Identity. Pendiente de implementar y provisionar.
- Se **descarta el SaaS Accelerator** e implementamos nativo, siguiendo su recomendación del 23.

## 2. Preguntas (priorizadas)

### A. Modelo comercial — **desbloquea diseño, la más urgente** *(negocio + técnico)*

1. Dijimos que queremos **pay-as-you-go** y nos propusisteis *flat rate + metered billing*. Antes de construirlo: **¿podemos empezar transaccionando con un plan de tarifa plana simple y añadir las dimensiones de consumo después**, o cambiar el modelo de precio de una oferta ya publicada **obliga a recertificar / crea fricción con los clientes existentes**?
2. **Dimensiones de medición:** ¿se pueden **añadir dimensiones nuevas** a una oferta ya publicada? ¿Y **cambiar el precio** de una existente? ¿Qué es irreversible una vez publicado?
3. Nuestro coste variable real es el consumo de IA por dictado. ¿Qué unidad recomendáis facturar — **sesión/dictado**, o algo derivado de tokens? ¿Cómo lo resuelven otros ISV de IA?
4. **Fiabilidad del reporte de consumo:** si nuestra llamada a la Metering API falla o se duplica, **¿hay idempotencia o ventana de corrección**? ¿Se puede reenviar un consumo de un periodo ya cerrado?

*(Por qué importa: nuestro DESIGN dejó el metered billing fuera de v1 y asume un comprador individual sin cantidad de licencias. Según lo que respondan, o cerramos v1 con tarifa plana o reabrimos el diseño ahora — mucho más barato que después.)*

### B. Fulfillment secretless — **validación de nuestro diseño** *(técnico — Jesús)*

5. **La pregunta que quedó sin hacer el 23.** Somos **secretless por Managed Identity** (SQL, Blob y Azure OpenAI ya lo son) y no queremos un client secret en la app del fulfillment. Nuestro diseño: **UAMI del App Service como credencial federada de la app de Entra dedicada**, intercambio de assertion y token contra `20e940b3-…`. **¿Lo respaldáis?** ¿Algún ISV lo tiene así en producción? *(Lo hemos verificado en vuestra documentación: mismo tenant, así que el bloqueo `AADSTS700236` no aplica. Buscamos confirmación, no permiso.)*
6. ¿Hay **algo en la certificación** que exija o presuponga un client secret en la app del fulfillment? No querríamos descubrirlo al certificar.
7. **Registro del app ID en la *Technical configuration*:** ¿basta con **guardar el borrador** de la oferta para que las Fulfillment APIs empiecen a autorizar a esa app, o hay que **publicar en Preview** primero? *(Determina si podemos probar el cliente end-to-end antes de Preview o solo el intercambio de token.)*
8. **Auto-activation:** vuestra doc dice que con auto-activation el `resolve` no hace falta y los datos llegan por el webhook `Subscribe`. **¿Lo recomendáis** para un self-service puro como el nuestro, o es preferible el `resolve`/`activate` explícito? *(Cambia el diseño de nuestra landing: SPEC-03.)*

### C. Ciclo de vida y postventa *(mixto)*

9. **Cancelación:** ¿qué ve exactamente el cliente y **desde dónde** cancela (portal de Microsoft)? ¿Podemos enlazar a esa superficie desde nuestra app? *(Nuestra política de retención — bloqueo + ventana de 90 días + borrado — está diseñada como **post-baja**, asumiendo que la cancelación ocurre en vuestro lado y nos llega por webhook. ¿Correcto?)*
10. **Reintentos del webhook:** ¿cuántas veces reintentáis, con qué espaciado, y **garantizáis orden**? ¿Cómo debe responder nuestro endpoint (código, cuerpo, plazo)? *(Nuestro diseño ya es idempotente; queremos confirmar los supuestos.)*
11. Un cliente que **cancela y vuelve a comprar**: ¿es la **misma** `subscriptionId` o una nueva? *(Determina si podemos reengancharlo con sus datos intactos.)*

### D. Preview, certificación y papeleo — *pendientes del 23* *(negocio)*

12. **Compra de prueba en Preview sin coste**: ¿private plan a $1, cancelación en 72 h, u oferta DEV separada? ¿Qué hacéis vosotros normalmente? *(Marcelo mencionó que cancelar dentro de 72 h no se factura.)*
13. **Certificación:** ¿revisáis ficha, demo o **compra end-to-end**? ¿Plazos reales? ¿Los rechazos más frecuentes en ofertas SaaS transactables de un ISV primerizo?
14. **Tax del Seller `87879330` = "Action required"** (W-8BEN-E en curso). Dos dudas que nos frenan: **artículo y tipo de renta del tratado España–EE. UU.** aplicable a los pagos del Marketplace y su % de retención; y confirmar **`Chapter 3 = Corporation`** para una S.L. española. ¿A qué equipo se escala?
15. **"Manage default payment profiles" está vacío**: ¿cómo se asigna el payout por defecto al programa Marketplace?
16. **[P1–P3 del 23, si hay tiempo]** Créditos Azure de ISV Success: ¿cuántos, y **cubren consumo de Azure OpenAI**? ¿Marketplace Rewards / Engagement Manager?

### E. Ofertas suyas que conviene aceptar

17. **Sesión de revisión de arquitectura con un arquitecto** — ofrecida el 23. ¿La agendamos? *(Nos interesa que miren la red privada + secretless antes de certificar.)*
18. ¿Llegó a enviarse el **email con enlaces y documentación** que comentaste? No nos consta haberlo recibido.

## 3. Materiales

- `ARQUITECTURA.md` (diagramas; ya lo vieron y les gustó).
- La app en producción — se puede repetir la demo si entra gente nueva.
- `SPEC-02_fulfillment-secretless.md` §2.2 si hace falta enseñar la cadena de confianza concreta al hablar de la B5.

## 4. Notas post-reunión

*(rellenar durante/después: respuestas, compromisos, quién hace qué. Volcar también al `RUNBOOK-partner-center.md` lo que sea burocrático y al `DESIGN.md` lo que reabra decisiones.)*
