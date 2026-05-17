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
      max_tokens: 2048,
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
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    };
  }
}
