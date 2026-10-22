import { BedrockAgentCaller } from '../agents/baseBedrockClient.js';
import { RoutingDecision, TargetAgent } from './types.js';

export class RouterAgent {
  private caller: BedrockAgentCaller;
  // Modèle ultra-léger et économique pour la classification d'intention
  private routerModelId = 'us.amazon.nova-micro-v1:0';

  private systemPrompt = `Tu es le Dispatcher / Intent Router d'une plateforme e-commerce & super-app.
Ton unique tâche est de classifier la requête de l'utilisateur vers l'agent spécialisé approprié :
1. "PRODUCT_SEARCH" : Recherche d'articles, caractéristiques, prix, recommandations, stock.
2. "ORDER_TRACKING" : Suivi de livraison, état d'une commande, retard de coursier.
3. "BILLING_DISPUTE" : Problème de paiement, débit indu, remboursement, litige de facture, Mobile Money.
4. "GENERAL_FAQ" : Questions générales sur les horaires, politiques de retour, contact général.

Extrais également les entités si présentes (orderId, productQuery, amountFcfa).
Retourne obligatoirement un JSON valide suivant ce format :
{
  "targetAgent": "PRODUCT_SEARCH" | "ORDER_TRACKING" | "BILLING_DISPUTE" | "GENERAL_FAQ",
  "confidence": 0.95,
  "reasoning": "Court justificatif de la décision",
  "extractedEntities": {
    "orderId": "si mentionné",
    "productQuery": "si mentionné",
    "amountFcfa": 0
  }
}`;

  constructor() {
    this.caller = new BedrockAgentCaller();
  }

  /**
   * Routage hybride :
   * 1. Règle déterministe rapide (Regex / Mots-clés évidents) -> 0 token, 0 ms
   * 2. Si ambigu, recours au LLM Router rapide (Nova Micro / Claude Haiku)
   */
  async route(userInput: string): Promise<RoutingDecision> {
    const textLower = userInput.toLowerCase();

    // ── NIVEAU 1 : ROUTAGE DÉTERMINISTE (FAST PATH) ──
    const orderMatch = userInput.match(/ORD-[A-Z0-9]+/i);
    if (orderMatch && (textLower.includes('où') || textLower.includes('suivi') || textLower.includes('colis') || textLower.includes('statut'))) {
      return {
        targetAgent: 'ORDER_TRACKING',
        routingMethod: 'DETERMINISTIC_RULE',
        confidence: 1.0,
        reasoning: 'Détection déterministe d\'un ID de commande et mot-clé de suivi (0 token consommé).',
        modelUsed: 'REGEX_ENGINE',
        extractedEntities: { orderId: orderMatch[0].toUpperCase() },
      };
    }

    // ── NIVEAU 2 : ROUTAGE SÉMANTIQUE PAR LLM (SLOW PATH) ──
    const userPrompt = `Classifie cette demande utilisateur : "${userInput}"`;

    const decision = await this.caller.runWithRetry<RoutingDecision>(
      'RouterAgent (Nova Micro)',
      this.systemPrompt,
      userPrompt,
      async () => {
        // Fallback heuristique simulant le LLM léger en mode local
        return this.simulateLlmRouting(userInput);
      }
    );

    return {
      ...decision,
      routingMethod: 'LLM_CLASSIFIER',
      modelUsed: this.routerModelId,
    };
  }

  private simulateLlmRouting(input: string): RoutingDecision {
    const text = input.toLowerCase();

    if (text.includes('horaire') || text.includes('zone') || text.includes('contact') || text.includes('dimanche') || text.includes('politique')) {
      return {
        targetAgent: 'GENERAL_FAQ',
        routingMethod: 'LLM_CLASSIFIER',
        confidence: 0.95,
        reasoning: 'Demande générale d\'informations sur les horaires ou zones de service.',
        modelUsed: this.routerModelId,
        extractedEntities: {},
      };
    }

    if (text.includes('rembourse') || text.includes('débit') || text.includes('argent') || text.includes('surfactur') || text.includes('payer')) {
      const amountMatch = text.match(/(\d+)\s*(fcfa|f|cfa|\$|€)/i);
      return {
        targetAgent: 'BILLING_DISPUTE',
        routingMethod: 'LLM_CLASSIFIER',
        confidence: 0.96,
        reasoning: 'Le client évoque un litige financier ou une réclamation de remboursement.',
        modelUsed: this.routerModelId,
        extractedEntities: { amountFcfa: amountMatch ? parseInt(amountMatch[1], 10) : undefined },
      };
    }

    if (text.includes('livr') || text.includes('colis') || text.includes('commande') || text.includes('coursier') || text.includes('retard')) {
      const orderMatch = input.match(/ORD-[A-Z0-9]+/i);
      return {
        targetAgent: 'ORDER_TRACKING',
        routingMethod: 'LLM_CLASSIFIER',
        confidence: 0.94,
        reasoning: 'Intention liée à l\'acheminement ou au délai d\'une commande.',
        modelUsed: this.routerModelId,
        extractedEntities: { orderId: orderMatch ? orderMatch[0] : undefined },
      };
    }

    if (text.includes('cherch') || text.includes('prix') || text.includes('taille') || text.includes('acheter') || text.includes('casque') || text.includes('téléphone')) {
      return {
        targetAgent: 'PRODUCT_SEARCH',
        routingMethod: 'LLM_CLASSIFIER',
        confidence: 0.93,
        reasoning: 'Intention de découverte de produit ou demande de spécifications techniques.',
        modelUsed: this.routerModelId,
        extractedEntities: { productQuery: input },
      };
    }

    return {
      targetAgent: 'GENERAL_FAQ',
      routingMethod: 'LLM_CLASSIFIER',
      confidence: 0.85,
      reasoning: 'Demande générale ou informative.',
      modelUsed: this.routerModelId,
      extractedEntities: {},
    };
  }
}
