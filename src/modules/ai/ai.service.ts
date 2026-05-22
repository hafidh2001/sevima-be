import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly defaultModel: string;
  private readonly maxTokens: number;
  private readonly maxRetries: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.apiUrl = this.configService.get<string>('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions');
    this.defaultModel = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    this.maxTokens = this.configService.get<number>('OPENAI_MAX_TOKENS', 4000);
    this.maxRetries = 3;
  }

  async complete(messages: LlmMessage[], options: LlmOptions = {}): Promise<LlmResponse> {
    const {
      temperature = 0.7,
      maxTokens = this.maxTokens,
      model = this.defaultModel,
    } = options;

    if (!this.apiKey) {
      throw new InternalServerErrorException('AI service not configured: OPENAI_API_KEY is missing');
    }

    const payload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          this.logger.error(`OpenAI API error: ${response.status} - ${errorBody}`);

          if (response.status === 429 && attempt < this.maxRetries) {
            const retryDelay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`Rate limited, retrying in ${retryDelay}ms...`);
            await this.sleep(retryDelay);
            continue;
          }

          throw new InternalServerErrorException(`AI service error: ${response.status}`);
        }

        const data = await response.json() as {
          choices: Array<{ message: { content: string } }>;
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        };

        const content = data.choices[0]?.message?.content || '';

        if (!content) {
          throw new InternalServerErrorException('AI service returned empty response');
        }

        return {
          content,
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          } : undefined,
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          const retryDelay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`AI request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }

    throw new InternalServerErrorException(`AI service failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async streamComplete(
    messages: LlmMessage[],
    options: LlmOptions = {},
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const {
      temperature = 0.7,
      maxTokens = this.maxTokens,
      model = this.defaultModel,
    } = options;

    if (!this.apiKey) {
      throw new InternalServerErrorException('AI service not configured: OPENAI_API_KEY is missing');
    }

    const payload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`OpenAI API error: ${response.status} - ${errorBody}`);
      throw new InternalServerErrorException(`AI service error: ${response.status}`);
    }

    if (!response.body) {
      throw new InternalServerErrorException('AI service returned empty response stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return fullContent;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  truncateMessage(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.slice(0, maxLength - 3) + '...';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
