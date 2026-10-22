import {
  BedrockRuntimeClient,
  ConverseCommand,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import { CONFIG } from '../config/env.js';

export class BedrockAgentCaller {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({ region: CONFIG.AWS_REGION });
    this.modelId = CONFIG.MODEL_ID;
  }

  /**
   * Exécute un agent avec retry exponentiel (similaire à run_agent_with_retry en Python).
   */
  async runWithRetry<T>(
    agentName: string,
    systemPrompt: string,
    userPrompt: string,
    mockFallbackHandler: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    if (CONFIG.MOCK_BEDROCK) {
      // Mode simulation active : exécute directement la logique métier de l'agent
      return await mockFallbackHandler();
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const messages: Message[] = [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ];

        const command = new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: systemPrompt }],
          messages,
          inferenceConfig: {
            temperature: 0.1,
            maxTokens: 2048,
          },
        });

        const response = await this.client.send(command);
        const textOutput = response.output?.message?.content?.[0]?.text;

        if (!textOutput) {
          throw new Error(`Aucune réponse textuelle reçue de ${agentName}`);
        }

        // Tente d'extraire le JSON retourné par le LLM
        const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as T;
        }

        return JSON.parse(textOutput) as T;
      } catch (err: any) {
        if (attempt < maxRetries - 1) {
          const waitMs = Math.pow(2, attempt) * 1000;
          console.warn(`    [Retry ${attempt + 1}/${maxRetries} pour ${agentName}] ${err.name}, attente de ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else {
          console.error(`    [Échec critique ${agentName}] Bascule sur le handler de secours.`);
          return await mockFallbackHandler();
        }
      }
    }

    return await mockFallbackHandler();
  }
}
