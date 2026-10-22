export type TargetAgent = 
  | 'PRODUCT_SEARCH'
  | 'ORDER_TRACKING'
  | 'BILLING_DISPUTE'
  | 'GENERAL_FAQ';

export interface RoutingDecision {
  targetAgent: TargetAgent;
  routingMethod: 'DETERMINISTIC_RULE' | 'LLM_CLASSIFIER';
  confidence: number;
  reasoning: string;
  modelUsed: string;
  extractedEntities: {
    orderId?: string;
    productQuery?: string;
    amountFcfa?: number;
  };
}

export interface AgentExecutionResult {
  agentName: string;
  modelId: string;
  outputMessage: string;
  dataPayload?: any;
}

export interface RouterPipelineResponse {
  userInput: string;
  routingDecision: RoutingDecision;
  agentResult: AgentExecutionResult;
  executionMetrics: {
    routingLatencyMs: number;
    totalLatencyMs: number;
  };
}
