import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './base.js';

export class AnthropicProvider extends LLMProvider {
  get name() { return 'anthropic'; }

  get models() {
    return [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ];
  }

  validateApiKey() {
    return typeof this.apiKey === 'string' && this.apiKey.startsWith('sk-ant-');
  }

  async distill(text, model = 'claude-sonnet-4-6', systemPrompt) {
    const client = new Anthropic({ apiKey: this.apiKey });

    const message = await client.messages.create({
      model,
      // 16k da margen de sobra para el prompt destilado de un speech largo
      // (el límite anterior de 2048 truncaba a media palabra en dictados de ~40 min).
      // Se mantiene por debajo de ~16k para no arriesgar timeouts HTTP del SDK sin streaming;
      // Sonnet 4.6 admite hasta 64k de salida si en el futuro hiciera falta más (con streaming).
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const prompt = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      prompt,
      // El destilador debería autolimitarse muy por debajo del tope; si aun así
      // llega a max_tokens, la salida está cortada y hay que avisar (no guardar en silencio).
      truncated: message.stop_reason === 'max_tokens',
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    };
  }
}
