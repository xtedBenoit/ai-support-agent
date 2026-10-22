import { z } from 'zod';

/**
 * Nettoie les balises de réflexion interne générées par les modèles de raisonnement
 * (Amazon Nova, Anthropic Claude Thinking, DeepSeek).
 */
export function cleanThinkingTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1')
    .trim();
}

/**
 * Extrait et parse du JSON de manière ultra-tolérante même si le LLM
 * a ajouté du texte conversationnel autour ou des balises markdown.
 */
export function safeJsonExtract<T = any>(rawText: string, schema?: z.ZodSchema<T>): T {
  const cleaned = cleanThinkingTags(rawText);

  let parsed: any;
  try {
    // 1. Essai direct
    parsed = JSON.parse(cleaned);
  } catch {
    // 2. Recherche du bloc JSON délimité par { ... } ou [ ... ]
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!jsonMatch) {
      throw new Error(`Impossible d'extraire un JSON valide du texte : "${rawText.slice(0, 100)}..."`);
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  // 3. Validation de schéma optionnelle via Zod
  if (schema) {
    return schema.parse(parsed);
  }

  return parsed as T;
}

/**
 * Masque les données personnelles identifiables (PII) avant enregistrement
 * dans les bases de données d'audit ou logs CloudWatch.
 */
export function maskPii(text: string): string {
  if (!text) return '';
  return text
    // Masque les cartes bancaires (16 chiffres)
    .replace(/\b(?:\d{4}[ -]?){3}(\d{4})\b/g, '****-****-****-$1')
    // Masque les emails
    .replace(/([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)/g, (match, user, domain) => {
      const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
      return `${maskedUser}@${domain}`;
    })
    // Masque les numéros de téléphone internationaux
    .replace(/(\+\d{1,3}\s?)(\d{2})[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?(\d{2})/g, '$1$2-**-**-$3');
}
