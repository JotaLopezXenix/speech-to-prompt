import { DefaultAzureCredential } from '@azure/identity';
import { LLMProvider } from './base.js';

// Azure OpenAI (modelos GPT) como destilador. Es un servicio **first-party de
// Azure** → su consumo se factura como consumo Azure nativo y, por tanto, va
// **contra el crédito de la suscripción** (a diferencia de Claude/Anthropic, que
// es Marketplace y NO es creditable). Por eso sustituye a Claude para el LLM.
//
// Reutiliza el MISMO recurso Azure OpenAI que el STT (`aoai-speech-to-prompt`,
// West Europe): se añade un deployment GPT junto al de `whisper`, con la misma
// clave/endpoint/región. Llama a Chat Completions por REST (sin SDK, igual que el
// resto de proveedores del proyecto).
//
// Variables de entorno:
//   AZURE_OPENAI_ENDPOINT   base del recurso, https://<recurso>.openai.azure.com
//   LLM_MODEL               nombre del *deployment* GPT (debe coincidir con el id
//                           usado en model_prices; recomendado: gpt-4.1)
//   AZURE_OPENAI_API_KEY    clave (opcional; sin clave → Managed Identity)
//
// Auth: cabecera `api-key`, o —sin clave— Entra ID / Managed Identity vía
// DefaultAzureCredential (scope de Cognitive Services). Es el camino secretless (D3).
const API_VERSION = '2024-10-21';
const ENTRA_SCOPE = 'https://cognitiveservices.azure.com/.default';

export class AzureOpenAIProvider extends LLMProvider {
  get name() { return 'azure-openai'; }

  get models() {
    // El modelo lo define el *deployment*; estas etiquetas son pistas de UI. El
    // deployment real se fija por entorno (LLM_MODEL). gpt-4.1 es el destilador
    // recomendado (workhorse equivalente a Sonnet); ver memoria del proyecto.
    return [
      { id: 'gpt-4.1',      label: 'GPT-4.1 (Azure OpenAI)' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (Azure OpenAI)' },
      { id: 'gpt-5.1',      label: 'GPT-5.1 (Azure OpenAI)' },
      { id: 'o3',           label: 'o3 (Azure OpenAI)' },
      { id: 'o3-pro',       label: 'o3-pro (Azure OpenAI)' },
      { id: 'o4-mini',      label: 'o4-mini (Azure OpenAI)' },
      { id: 'gpt-5',        label: 'GPT-5 (Azure OpenAI)' },
      { id: 'gpt-5.4',      label: 'GPT-5.4 (Azure OpenAI)' },
    ];
  }

  validateApiKey() {
    // Puede autenticar por Managed Identity (sin clave): no exigimos clave.
    return true;
  }

  async _authHeaders() {
    if (this.apiKey) return { 'api-key': this.apiKey };
    // Sin clave → Entra ID / Managed Identity. DefaultAzureCredential elige la
    // mejor credencial del entorno (MI en Azure; `az login`/env en local).
    const token = await new DefaultAzureCredential().getToken(ENTRA_SCOPE);
    if (!token) throw new Error('Azure OpenAI: no se pudo obtener token de Managed Identity/Entra.');
    return { Authorization: `Bearer ${token.token}` };
  }

  async distill(text, model = 'gpt-4.1', systemPrompt) {
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
    if (!endpoint) {
      throw new Error(
        'Azure OpenAI sin configurar: falta AZURE_OPENAI_ENDPOINT (https://<recurso>.openai.azure.com).'
      );
    }
    // `model` aquí es el nombre del *deployment* GPT.
    const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${API_VERSION}`;

    const headers = { 'Content-Type': 'application/json', ...(await this._authHeaders()) };
    const body = {
      // Mismo planteamiento que el resto de proveedores: system + un único turno
      // de usuario con el texto a destilar. 16k de salida (margen para dictados
      // largos). gpt-4.1 acepta `max_tokens`; las variantes reasoning de GPT-5
      // requerirían `max_completion_tokens` (ajuste futuro si se cambia de modelo).
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      max_completion_tokens: 16000,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Azure OpenAI error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const prompt = choice?.message?.content ?? '';

    return {
      prompt,
      // finish_reason 'length' = salida cortada por el tope: avisar (no guardar en silencio).
      truncated: choice?.finish_reason === 'length',
      usage: {
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
    };
  }
}
