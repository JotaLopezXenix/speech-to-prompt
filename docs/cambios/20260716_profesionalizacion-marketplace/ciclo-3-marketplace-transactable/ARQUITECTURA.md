# Arquitectura Speech-to-prompt (fuente del diagrama)

Fuente editable de los diagramas (Mermaid; renderiza en VS Code / GitHub). Para la reunión ISV Success del 23-jul. Versión presentable: artefacto HTML publicado aparte.

## 1. Arquitectura actual (en producción · 100% Azure · secretless)

```mermaid
flowchart TB
  U["Profesional · navegador / PWA móvil"]
  E["Microsoft Entra ID<br/>multi-tenant + cuentas personales MSA"]

  subgraph AZ["Azure · West Europe · RG rg-speech-to-prompt"]
    AS["App Service (Linux, Node 24)<br/>SPA React/Vite/TS (PWA) en / + API Express<br/>valida bearer JWT (JWKS) · abstracción LLM/STT/Blob"]
    subgraph VNET["VNet + Private Endpoints · sin acceso público"]
      SQL[("Azure SQL<br/>Serverless")]
      BLOB[("Blob Storage<br/>audio privado")]
      AOAI["Azure OpenAI<br/>gpt-4.1 (destilado) · Whisper (STT)"]
    end
  end
  GH["GitHub Actions · CI/CD"]

  U -->|HTTPS + bearer token| AS
  U -.->|SSO login| E
  AS -.->|valida token| E
  AS ==>|Managed Identity| SQL
  AS ==>|Managed Identity| BLOB
  AS ==>|Managed Identity| AOAI
  GH -->|deploy| AS
```

**Claves:** identidad Entra multi-tenant + MSA (login de un clic con cualquier cuenta Microsoft) · datos y modelos **solo alcanzables por red privada** (Private Endpoints) · la app se autentica contra SQL/Blob/Azure OpenAI con **Managed Identity** (sin secretos) · procesadores **first-party de Azure** (facturables contra crédito).

## 2. Integración Marketplace — ciclo 3 (a construir)

```mermaid
flowchart LR
  MP["Microsoft Marketplace<br/>compra de suscripción"]
  FUL["SaaS Fulfillment APIs v2"]
  subgraph NEW["App Service · ciclo 3 (a construir)"]
    LP["Landing de activación<br/>resolve → activate"]
    WH["Webhook 24/7<br/>Subscribe · Cancel · ChangePlan…"]
    SUBS[("Suscripciones<br/>en Azure SQL")]
    GATE["Gate por suscripción<br/>(sustituye la lista blanca interina)"]
  end
  MP -->|redirect + token| LP
  MP -->|eventos| WH
  LP -->|OAuth app dedicada| FUL
  WH -->|valida JWT + ACK| FUL
  LP --> SUBS
  WH --> SUBS
  SUBS --> GATE
```

**Claves:** fulfillment **nativo** en nuestro backend Node (no SaaS Accelerator) · el **gate por suscripción** reemplaza la lista blanca de correos actual · ⚠️ decisión abierta: la app de Entra del fulfillment pide *client secret* → buscamos alternativa **secretless** (credencial federada).
