import { RouterAgent } from './routerAgent.js';
import {
  ProductSearchAgent,
  OrderTrackingAgent,
  BillingDisputeAgent,
  GeneralFaqAgent,
} from './specializedAgents.js';
import { RouterPipelineResponse, AgentExecutionResult } from './types.js';

export class RoutingCoordinator {
  private router: RouterAgent;
  private productAgent: ProductSearchAgent;
  private trackingAgent: OrderTrackingAgent;
  private billingAgent: BillingDisputeAgent;
  private faqAgent: GeneralFaqAgent;

  constructor() {
    this.router = new RouterAgent();
    this.productAgent = new ProductSearchAgent();
    this.trackingAgent = new OrderTrackingAgent();
    this.billingAgent = new BillingDisputeAgent();
    this.faqAgent = new GeneralFaqAgent();
  }

  /**
   * Pipeline de Routage Multi-Modèle :
   * 1. Le Routeur analyse l'intention (déterministe ou LLM léger)
   * 2. Le coordinateur dispatche vers l'agent expert correspondant
   * 3. L'agent expert traite la requête avec son modèle et ses outils
   */
  async process(userInput: string): Promise<RouterPipelineResponse> {
    const startTime = Date.now();

    // ── ÉTAPE 1 : CLASSIFICATION & ROUTAGE ──
    const routingDecision = await this.router.route(userInput);
    const routingLatencyMs = Date.now() - startTime;

    // ── ÉTAPE 2 : DISPATCH VERS L'AGENT SPÉCIALISÉ ──
    let agentResult: AgentExecutionResult;

    switch (routingDecision.targetAgent) {
      case 'PRODUCT_SEARCH':
        agentResult = await this.productAgent.handle(userInput, routingDecision.extractedEntities);
        break;

      case 'ORDER_TRACKING':
        agentResult = await this.trackingAgent.handle(userInput, routingDecision.extractedEntities);
        break;

      case 'BILLING_DISPUTE':
        agentResult = await this.billingAgent.handle(userInput, routingDecision.extractedEntities);
        break;

      case 'GENERAL_FAQ':
      default:
        agentResult = await this.faqAgent.handle(userInput);
        break;
    }

    const totalLatencyMs = Date.now() - startTime;

    return {
      userInput,
      routingDecision,
      agentResult,
      executionMetrics: {
        routingLatencyMs,
        totalLatencyMs,
      },
    };
  }
}
