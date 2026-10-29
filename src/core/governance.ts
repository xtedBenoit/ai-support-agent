import { cleanThinkingTags, safeJsonExtract, maskPii } from './sanitizer.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. TOKEN BUCKET RATE LIMITER
// ─────────────────────────────────────────────────────────────────────────────
export class TokenBucketRateLimiter {
  private capacity: number;
  private tokens: number;
  private refillRatePerSec: number;
  private lastRefillTimestamp: number;

  constructor(options: { refillRatePerSec?: number; burstCapacity?: number } = {}) {
    this.refillRatePerSec = options.refillRatePerSec ?? 50; // 50 req/sec par défaut
    this.capacity = options.burstCapacity ?? 100;           // Burst max à 100
    this.tokens = this.capacity;
    this.lastRefillTimestamp = Date.now();
  }

  /**
   * Vérifie si la requête est autorisée selon les jetons disponibles.
   */
  allowRequest(tokensRequired = 1): boolean {
    this.refill();
    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillTimestamp) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
    this.lastRefillTimestamp = now;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KILL SWITCH CIRCUIT BREAKER
// ─────────────────────────────────────────────────────────────────────────────
export class KillSwitchCircuitBreaker {
  private maxViolations: number;
  private windowSeconds: number;
  private violationTimestamps: number[] = [];
  private isTriggered = false;
  private triggerReason = '';

  constructor(options: { maxViolations?: number; windowSeconds?: number } = {}) {
    this.maxViolations = options.maxViolations ?? 3;   // 3 violations
    this.windowSeconds = options.windowSeconds ?? 60; // en 60 secondes
  }

  /**
   * Enregistre une violation de sécurité et vérifie le déclenchement du kill switch.
   */
  recordViolation(reason: string): boolean {
    const now = Date.now();
    this.violationTimestamps.push(now);

    // Filtre les violations dans la fenêtre glissante
    const windowStart = now - this.windowSeconds * 1000;
    this.violationTimestamps = this.violationTimestamps.filter((t) => t >= windowStart);

    if (this.violationTimestamps.length >= this.maxViolations) {
      this.isTriggered = true;
      this.triggerReason = `🚨 KILL SWITCH ACTIF : ${this.violationTimestamps.length} violations détectées en moins de ${this.windowSeconds}s (Dernière: ${reason})`;
      return true;
    }

    return false;
  }

  isActive(): boolean {
    return this.isTriggered;
  }

  getReason(): string {
    return this.triggerReason;
  }

  getViolationCount(): number {
    return this.violationTimestamps.length;
  }

  reset(): void {
    this.isTriggered = false;
    this.triggerReason = '';
    this.violationTimestamps = [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DUAL-DIRECTION GUARDRAIL (INPUT & OUTPUT)
// ─────────────────────────────────────────────────────────────────────────────
export interface GuardrailCheckResult {
  action: 'ALLOWED' | 'BLOCKED' | 'ANONYMIZED';
  direction: 'INPUT' | 'OUTPUT';
  violations: string[];
  sanitizedText: string;
}

export class DualGuardrailScanner {
  private deniedInputTopics = [
    /\b(conseil\s+boursier|acheter\s+l'action|investir\s+sur|insider\s+tip|info\s+confidentielle|menace|agression|tuer|bombe)\b/i,
  ];

  private deniedOutputTopics = [
    /\b(je\s+vous\s+conseille\s+d'acheter|rendement\s+garanti\s+à\s+100%|investissez\s+vite)\b/i,
  ];

  scan(text: string, direction: 'INPUT' | 'OUTPUT'): GuardrailCheckResult {
    const violations: string[] = [];

    // 1. Contrôle PII sensible bloquant (Cartes bancaires, numéros de sécurité sociale)
    if (/\b(?:\d{4}[ -]?){3}\d{4}\b/.test(text)) {
      violations.push('PII_CREDIT_CARD_DETECTED');
    }

    // 2. Contrôle de sujets interdits selon la direction
    const topicRules = direction === 'INPUT' ? this.deniedInputTopics : this.deniedOutputTopics;
    for (const rule of topicRules) {
      if (rule.test(text)) {
        violations.push(`DENIED_TOPIC_${direction}`);
      }
    }

    if (violations.length > 0) {
      return {
        action: 'BLOCKED',
        direction,
        violations,
        sanitizedText: text,
      };
    }

    // 3. Anonymisation douce des emails et téléphones
    const sanitized = maskPii(text);
    const wasAnonymized = sanitized !== text;

    return {
      action: wasAnonymized ? 'ANONYMIZED' : 'ALLOWED',
      direction,
      violations: [],
      sanitizedText: sanitized,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GOVERNANCE METRICS TRACKER (Audits & CloudWatch-style Telemetry)
// ─────────────────────────────────────────────────────────────────────────────
export interface GovernanceMetricsSnapshot {
  totalRequests: number;
  allowedRequests: number;
  rateLimitBlocked: number;
  inputGuardrailBlocked: number;
  outputGuardrailBlocked: number;
  killSwitchTriggeredCount: number;
  averageLatencyMs: number;
}

export class GovernanceMetricsTracker {
  private totalRequests = 0;
  private allowedRequests = 0;
  private rateLimitBlocked = 0;
  private inputGuardrailBlocked = 0;
  private outputGuardrailBlocked = 0;
  private killSwitchTriggeredCount = 0;
  private latencies: number[] = [];

  recordRequest(status: 'ALLOWED' | 'RATE_LIMITED' | 'INPUT_BLOCKED' | 'OUTPUT_BLOCKED' | 'KILL_SWITCH', latencyMs: number): void {
    this.totalRequests++;
    this.latencies.push(latencyMs);

    switch (status) {
      case 'ALLOWED':
        this.allowedRequests++;
        break;
      case 'RATE_LIMITED':
        this.rateLimitBlocked++;
        break;
      case 'INPUT_BLOCKED':
        this.inputGuardrailBlocked++;
        break;
      case 'OUTPUT_BLOCKED':
        this.outputGuardrailBlocked++;
        break;
      case 'KILL_SWITCH':
        this.killSwitchTriggeredCount++;
        break;
    }
  }

  getSnapshot(): GovernanceMetricsSnapshot {
    const avgLatency = this.latencies.length > 0
      ? Math.round((this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) * 10) / 10
      : 0;

    return {
      totalRequests: this.totalRequests,
      allowedRequests: this.allowedRequests,
      rateLimitBlocked: this.rateLimitBlocked,
      inputGuardrailBlocked: this.inputGuardrailBlocked,
      outputGuardrailBlocked: this.outputGuardrailBlocked,
      killSwitchTriggeredCount: this.killSwitchTriggeredCount,
      averageLatencyMs: avgLatency,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MODEL EVALUATOR (LLM-as-Judge)
// ─────────────────────────────────────────────────────────────────────────────
export interface EvaluationScore {
  compliance: number;   // 1 à 5
  relevance: number;    // 1 à 5
  safety: number;       // 1 à 5
  completeness: number; // 1 à 5
  averageScore: number; // 1.0 à 5.0
  verdict: 'EXCELLENT' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT';
  notes: string;
}

export class LlmJudgeEvaluator {
  /**
   * Évalue la réponse d'un agent ouvrier selon les 4 critères d'audit.
   */
  async evaluate(params: {
    userQuestion: string;
    agentResponse: string;
  }): Promise<EvaluationScore> {
    const { userQuestion, agentResponse } = params;

    // Analyse heuristique des critères (peut appeler Claude Sonnet en mode live)
    let compliance = 5;
    let relevance = 5;
    let safety = 5;
    let completeness = 5;

    // Détection de non-conformité ou conseil d'investissement non autorisé
    if (/garanti|acheter|investir/i.test(agentResponse)) {
      compliance = 2;
      safety = 2;
    }

    // Réponse trop courte ou incomplète
    if (agentResponse.length < 50) {
      completeness = 3;
    }

    // Hors sujet
    if (userQuestion.includes('wash sale') && !agentResponse.includes('30')) {
      relevance = 3;
    }

    const averageScore = Math.round(((compliance + relevance + safety + completeness) / 4) * 10) / 10;
    const verdict = averageScore >= 4.5 ? 'EXCELLENT' : averageScore >= 3.5 ? 'ACCEPTABLE' : 'NEEDS_IMPROVEMENT';

    return {
      compliance,
      relevance,
      safety,
      completeness,
      averageScore,
      verdict,
      notes: `Évaluation impartiale : Compliance=${compliance}/5, Sécurité=${safety}/5, Pertinence=${relevance}/5.`,
    };
  }
}
