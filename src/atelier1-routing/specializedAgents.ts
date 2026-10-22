import { AgentExecutionResult } from './types.js';

// ── AGENT 1 : RECHERCHE DE PRODUITS (Modèle Équilibré / Rapide) ──
export class ProductSearchAgent {
  public modelId = 'us.amazon.nova-lite-v1:0';

  async handle(query: string, entities: any): Promise<AgentExecutionResult> {
    const mockProducts = [
      { id: 'PROD-01', name: 'Casque Moto Intégral Homologué', priceFcfa: 25000, inStock: true },
      { id: 'PROD-02', name: 'Support Smartphone Étanche pour Guidon', priceFcfa: 6500, inStock: true },
      { id: 'PROD-03', name: 'Gilet Réfléchissant de Sécurité', priceFcfa: 4000, inStock: true },
    ];

    return {
      agentName: 'ProductSearchAgent',
      modelId: this.modelId,
      outputMessage: `J'ai trouvé plusieurs articles correspondant à votre recherche :\n` +
        mockProducts.map((p) => `• ${p.name} — ${p.priceFcfa.toLocaleString()} FCFA (${p.inStock ? 'En stock' : 'Rupture'})`).join('\n') +
        `\nSouhaitez-vous ajouter l'un de ces articles à votre panier ?`,
      dataPayload: { products: mockProducts, query },
    };
  }
}

// ── AGENT 2 : SUIVI DE COMMANDES & LOGISTIQUE ──
export class OrderTrackingAgent {
  public modelId = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

  async handle(query: string, entities: any): Promise<AgentExecutionResult> {
    const orderId = entities.orderId || 'ORD-98214';

    return {
      agentName: 'OrderTrackingAgent',
      modelId: this.modelId,
      outputMessage: `Votre commande ${orderId} est actuellement en cours d'acheminement par notre coursier Gozem.\n` +
        `• Statut : EN COURS DE LIVRAISON\n` +
        `• Heure estimée d'arrivée : dans 18 minutes\n` +
        `• Lieu de livraison : Quartier Tokoin, Lomé\n` +
        `Le coursier prendra contact avec vous à son arrivée.`,
      dataPayload: { orderId, status: 'IN_TRANSIT', etaMinutes: 18 },
    };
  }
}

// ── AGENT 3 : LITIGES & FACTURATION (Modèle Raisonnement Lourd : Claude 3.5 Sonnet) ──
export class BillingDisputeAgent {
  public modelId = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

  async handle(query: string, entities: any): Promise<AgentExecutionResult> {
    const amount = entities.amountFcfa || 1500;

    return {
      agentName: 'BillingDisputeAgent',
      modelId: this.modelId,
      outputMessage: `[Dossier Litige Financier Ouvert]\n` +
        `J'ai analysé votre signalement concernant le montant de ${amount.toLocaleString()} FCFA.\n` +
        `Après audit de votre historique de paiement, une déviation anormale a été identifiée. ` +
        `Votre dossier est éligible à une régularisation automatique sur votre portefeuille sous 15 minutes.`,
      dataPayload: { disputedAmount: amount, resolutionStatus: 'PRE_APPROVED_FOR_AUDIT' },
    };
  }
}

// ── AGENT 4 : FAQ GÉNÉRALE ──
export class GeneralFaqAgent {
  public modelId = 'us.amazon.nova-micro-v1:0';

  async handle(query: string): Promise<AgentExecutionResult> {
    return {
      agentName: 'GeneralFaqAgent',
      modelId: this.modelId,
      outputMessage: `Notre service client est disponible 24/7. Les livraisons s'effectuent tous les jours de 07h à 22h. ` +
        `Pour toute question sur nos conditions générales de vente ou notre politique de confidentialité, n'hésitez pas à demander.`,
      dataPayload: { category: 'FAQ_INFO' },
    };
  }
}
