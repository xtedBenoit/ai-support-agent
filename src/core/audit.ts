import { maskPii } from './sanitizer.js';

export interface AuditRecord {
  requestId: string;
  timestamp: string;
  inputText: string;
  routingMethod: 'PRIORITY' | 'RULE' | 'LLM' | 'FALLBACK';
  targetAgent: string;
  confidence: number;
  latencyMs: number;
  ttlEpochSeconds: number; // DynamoDB TTL pour suppression automatique
  metadata?: Record<string, any>;
}

export class AuditEngine {
  private inMemoryStore: AuditRecord[] = [];
  private retentionHours: number;

  constructor(options: { retentionHours?: number } = {}) {
    this.retentionHours = options.retentionHours ?? 24; // Par défaut : conservation 24h
  }

  /**
   * Enregistre une trace d'audit conforme (avec masquage PII et calcul du TTL).
   */
  async logDecision(params: {
    requestId: string;
    inputText: string;
    routingMethod: 'PRIORITY' | 'RULE' | 'LLM' | 'FALLBACK';
    targetAgent: string;
    confidence: number;
    latencyMs: number;
    metadata?: Record<string, any>;
  }): Promise<AuditRecord> {
    const now = new Date();
    const ttlEpochSeconds = Math.floor(now.getTime() / 1000) + this.retentionHours * 3600;

    const record: AuditRecord = {
      requestId: params.requestId,
      timestamp: now.toISOString(),
      // Règle de sécurité : tronquer à 80 chars et masquer le PII
      inputText: maskPii(params.inputText.slice(0, 80)),
      routingMethod: params.routingMethod,
      targetAgent: params.targetAgent,
      confidence: Math.round(params.confidence * 100) / 100,
      latencyMs: Math.round(params.latencyMs * 10) / 10,
      ttlEpochSeconds,
      metadata: params.metadata,
    };

    // Enregistrement dans le store (remplaçable par DynamoDB putItem en prod)
    this.inMemoryStore.push(record);
    return record;
  }

  /**
   * Récupère les métriques d'audit pour le monitoring et reporting.
   */
  getMetricsSummary(): {
    totalRecords: number;
    distributionByMethod: Record<string, number>;
    averageLatencyMs: number;
    averageConfidence: number;
  } {
    if (this.inMemoryStore.length === 0) {
      return {
        totalRecords: 0,
        distributionByMethod: {},
        averageLatencyMs: 0,
        averageConfidence: 0,
      };
    }

    const distribution: Record<string, number> = {};
    let totalLatency = 0;
    let totalConfidence = 0;

    for (const item of this.inMemoryStore) {
      distribution[item.routingMethod] = (distribution[item.routingMethod] || 0) + 1;
      totalLatency += item.latencyMs;
      totalConfidence += item.confidence;
    }

    return {
      totalRecords: this.inMemoryStore.length,
      distributionByMethod: distribution,
      averageLatencyMs: Math.round((totalLatency / this.inMemoryStore.length) * 10) / 10,
      averageConfidence: Math.round((totalConfidence / this.inMemoryStore.length) * 100) / 100,
    };
  }

  getRecentLogs(limit = 10): AuditRecord[] {
    return this.inMemoryStore.slice(-limit);
  }
}
