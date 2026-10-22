import { AuditEngine, AuditRecord } from './audit.js';

export interface RouteRule<TTarget extends string = string> {
  pattern: RegExp;
  target: TTarget;
  label?: string;
}

export interface CascadingRouteResult<TTarget extends string = string> {
  target: TTarget;
  method: 'PRIORITY' | 'RULE' | 'LLM' | 'FALLBACK';
  confidence: number;
  latencyMs: number;
  reason: string;
  auditRecord?: AuditRecord;
}

export interface CascadingRouterConfig<TTarget extends string = string> {
  priorityRules: RouteRule<TTarget>[];
  deterministicRules: RouteRule<TTarget>[];
  llmClassifier: (text: string) => Promise<{ target: TTarget; confidence: number; reason: string }>;
  fallbackTarget: TTarget;
  confidenceThreshold?: number; // Par défaut 0.60
  auditEngine?: AuditEngine;
}

/**
 * Moteur de routage en cascade générique (4 Paliers) :
 * 1. Détection de priorité / Urgence (Bypass)
 * 2. Règles déterministes par Regex (0 token, 0 ms)
 * 3. Classification sémantique LLM
 * 4. Fallback de sécurité
 */
export class CascadingRouter<TTarget extends string = string> {
  private config: CascadingRouterConfig<TTarget>;
  private confidenceThreshold: number;
  private auditEngine: AuditEngine;

  constructor(config: CascadingRouterConfig<TTarget>) {
    this.config = config;
    this.confidenceThreshold = config.confidenceThreshold ?? 0.6;
    this.auditEngine = config.auditEngine ?? new AuditEngine();
  }

  async route(requestId: string, inputText: string): Promise<CascadingRouteResult<TTarget>> {
    const startTime = performance.now();
    const textLower = inputText.toLowerCase();

    // ── PALIER 1 : CONTRÔLE DE PRIORITÉ / URGENCE ──
    for (const rule of this.config.priorityRules) {
      if (rule.pattern.test(textLower)) {
        const latencyMs = performance.now() - startTime;
        const audit = await this.auditEngine.logDecision({
          requestId,
          inputText,
          routingMethod: 'PRIORITY',
          targetAgent: rule.target,
          confidence: 1.0,
          latencyMs,
        });

        return {
          target: rule.target,
          method: 'PRIORITY',
          confidence: 1.0,
          latencyMs,
          reason: `Règle de priorité déclenchée : ${rule.label || rule.pattern.source}`,
          auditRecord: audit,
        };
      }
    }

    // ── PALIER 2 : RÈGLES DÉTERMINISTES (0 TOKEN) ──
    for (const rule of this.config.deterministicRules) {
      if (rule.pattern.test(textLower)) {
        const latencyMs = performance.now() - startTime;
        const audit = await this.auditEngine.logDecision({
          requestId,
          inputText,
          routingMethod: 'RULE',
          targetAgent: rule.target,
          confidence: 1.0,
          latencyMs,
        });

        return {
          target: rule.target,
          method: 'RULE',
          confidence: 1.0,
          latencyMs,
          reason: `Correspondance par mot-clé déterministe : ${rule.label || rule.pattern.source}`,
          auditRecord: audit,
        };
      }
    }

    // ── PALIER 3 : CLASSIFICATION LLM SÉMANTIQUE ──
    try {
      const llmResult = await this.config.llmClassifier(inputText);
      const latencyMs = performance.now() - startTime;

      if (llmResult.confidence >= this.confidenceThreshold) {
        const audit = await this.auditEngine.logDecision({
          requestId,
          inputText,
          routingMethod: 'LLM',
          targetAgent: llmResult.target,
          confidence: llmResult.confidence,
          latencyMs,
        });

        return {
          target: llmResult.target,
          method: 'LLM',
          confidence: llmResult.confidence,
          latencyMs,
          reason: `Classification LLM réussie (${llmResult.reason})`,
          auditRecord: audit,
        };
      } else {
        // Confiance insuffisante -> Glisse vers le Fallback
        const audit = await this.auditEngine.logDecision({
          requestId,
          inputText,
          routingMethod: 'FALLBACK',
          targetAgent: this.config.fallbackTarget,
          confidence: llmResult.confidence,
          latencyMs,
        });

        return {
          target: this.config.fallbackTarget,
          method: 'FALLBACK',
          confidence: llmResult.confidence,
          latencyMs,
          reason: `Confiance LLM trop faible (${Math.round(llmResult.confidence * 100)}% < ${Math.round(this.confidenceThreshold * 100)}%) -> Triage humain requis`,
          auditRecord: audit,
        };
      }
    } catch (err: any) {
      // ── PALIER 4 : FALLBACK CRITIQUE EN CAS D'ERREUR ──
      const latencyMs = performance.now() - startTime;
      const audit = await this.auditEngine.logDecision({
        requestId,
        inputText,
        routingMethod: 'FALLBACK',
        targetAgent: this.config.fallbackTarget,
        confidence: 0.0,
        latencyMs,
        metadata: { error: err.message },
      });

      return {
        target: this.config.fallbackTarget,
        method: 'FALLBACK',
        confidence: 0.0,
        latencyMs,
        reason: `Erreur durant l'inférence LLM (${err.message}) -> Repli sur l'agent généraliste`,
        auditRecord: audit,
      };
    }
  }

  getAuditEngine(): AuditEngine {
    return this.auditEngine;
  }
}
