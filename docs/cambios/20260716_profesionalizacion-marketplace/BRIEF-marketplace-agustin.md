# Azure Marketplace: qué exige cada nivel de oferta (brief para Agustín)

*Fuente: documentación oficial de Microsoft Learn, 16-jul-2026. La clave de la reunión: averiguar qué nivel exige Microsoft para contarnos las 3-4 apps — la diferencia entre niveles son meses de desarrollo.*

## Los tres niveles de oferta SaaS

| Nivel | Qué es | Qué nos exige | Esfuerzo |
|---|---|---|---|
| **Contact me** | Ficha; el cliente pide que le contactemos | **Nada técnico.** Solo ficha de calidad (descripción, capturas, vídeo) | Días |
| **Free trial / Get it now** | El cliente entra en la app desde el Marketplace | Login con cualquier cuenta Microsoft (SSO Entra + MSA) + landing de onboarding | Semanas (rehacer nuestra identidad, hoy solo tenant Xenix) |
| **Transactable** | Microsoft factura por nosotros (fee 3%) | Lo anterior + Fulfillment APIs + webhook 24/7 + planes de precio + perfil fiscal/payout validados | Semanas más (hay un SaaS Accelerator open-source de Microsoft que ayuda) |

**Se puede subir de nivel después de publicar; bajar desde transactable, no.** Jugada natural si urge: publicar en "Contact me" con ficha impecable y subir luego.

## Datos útiles

- **Certificación:** Microsoft revisa la ficha (calidad de textos/capturas + cómo usa Azure — ahí vamos sobrados: 100% Azure) y, solo en transactable, el flujo de compra e2e. Se puede resubmitir sin límite.
- **Requisito previo:** cuenta de Partner Center con Partner ID, enrolada en el programa Marketplace y verificada. Si no está, arrancar ya (burocracia con latencia). Fiscal/payout solo para transactable.
- **Beneficios:** ISV Success da $5k de Azure (Core) hasta $25k (Expanded, por invitación) — y **un listing "Contact me" ya cualifica**. Los beneficios crecientes de Marketplace Rewards (Engagement Manager, tiers) exigen transactable.

## Preguntas para el contacto de Microsoft

1. La "capacidad" que buscamos con las 3-4 apps, ¿de qué programa viene (ISV Success, Marketplace Rewards, otro)? ¿**Basta "Contact me"** o deben ser transactables? ¿Hay plazos?
2. Cuando revisen las apps, ¿qué miran: ficha, demo o alta/compra funcionando de extremo a extremo?
3. ¿Nuestro comprador tipo son **empresas** (varios empleados por cuenta) o **profesionales individuales**? *(condiciona el modelo de cuentas desde el día 1)*
4. ¿El alta de clientes debe ser **autoservicio** desde el Marketplace o podemos darlos de alta nosotros al principio?

## Fuentes

[Plan a SaaS offer](https://learn.microsoft.com/partner-center/marketplace-offers/plan-saas-offer) · [Listing options](https://learn.microsoft.com/partner-center/marketplace-offers/determine-your-listing-type) · [Review & publish](https://learn.microsoft.com/partner-center/marketplace-offers/review-publish-offer) · [Certification policies](https://learn.microsoft.com/legal/marketplace/certification-policies) · [ISV Success](https://learn.microsoft.com/partner-center/membership/isv-success) · [Marketplace Rewards](https://learn.microsoft.com/partner-center/marketplace-offers/marketplace-rewards) · [SaaS Accelerator](https://github.com/Azure/Commercial-Marketplace-SaaS-Accelerator)
