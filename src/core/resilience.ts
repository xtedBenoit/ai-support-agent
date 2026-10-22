export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

/**
 * Exécute une opération asynchrone avec retry exponentiel et jitter aléatoire.
 * Gère automatiquement le throttling Bedrock (429) et les erreurs réseau temporaires.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const label = options.label ?? 'AsyncOperation';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      if (isLastAttempt) {
        console.error(`❌ [${label}] Échec définitif après ${maxRetries} tentatives. Erreur: ${error.message}`);
        raiseOrRethrow(error);
      }

      // Calcul du délai exponentiel : 2^attempt * baseDelay + Jitter (0-500ms)
      const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;
      const jitter = Math.floor(Math.random() * 500);
      const delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);

      console.warn(
        `⚠️ [${label}] Tentative ${attempt + 1}/${maxRetries} échouée (${error.name || 'Error'}). ` +
        `Attente de ${delayMs}ms avant nouvel essai...`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`[${label}] Fin inattendue de la boucle de retry.`);
}

function raiseOrRethrow(error: any): never {
  throw error;
}
