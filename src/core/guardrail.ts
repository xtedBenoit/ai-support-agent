export type GuardrailDecisionStatus =
  | 'AUTO_APPROVED'
  | 'REQUIRES_HUMAN_SUPERVISOR'
  | 'BLOCKED_RISK_VIOLATION';

export interface GuardrailEvaluation<T = any> {
  status: GuardrailDecisionStatus;
  isSafeToExecute: boolean;
  confidenceScore: number;
  reason: string;
  violations: string[];
  payload?: T;
}

export interface GuardrailPolicy {
  minAutoConfidence?: number;       // Seuil min pour exécution automatique (ex: 0.70)
  minHumanReviewConfidence?: number; // Seuil min pour revue humaine (ex: 0.40)
  maxFinancialValue?: number;        // Plafond financier max (ex: 3000 FCFA ou 50$)
}

export class GuardrailEngine {
  private policy: Required<GuardrailPolicy>;

  constructor(policy: GuardrailPolicy = {}) {
    this.policy = {
      minAutoConfidence: policy.minAutoConfidence ?? 0.70,
      minHumanReviewConfidence: policy.minHumanReviewConfidence ?? 0.40,
      maxFinancialValue: policy.maxFinancialValue ?? 3000,
    };
  }

  /**
   * Évalue une décision d'agent par rapport aux seuils de confiance et règles financières.
   */
  evaluate<T>(params: {
    confidence: number;
    financialImpactValue?: number;
    riskFlags?: string[];
    payload?: T;
  }): GuardrailEvaluation<T> {
    const { confidence, financialImpactValue = 0, riskFlags = [], payload } = params;
    const violations: string[] = [];

    // 1. Contrôle des risques de sécurité majeurs
    if (riskFlags.length > 0) {
      return {
        status: 'BLOCKED_RISK_VIOLATION',
        isSafeToExecute: false,
        confidenceScore: confidence,
        reason: `Bloqué pour drapeaux de risque actifs : ${riskFlags.join(', ')}`,
        violations: riskFlags,
        payload,
      };
    }

    // 2. Contrôle du plafond financier (Circuit Breaker financier)
    if (financialImpactValue > this.policy.maxFinancialValue) {
      violations.push(`MONTANT_DEPASSE_PLAFOND (${financialImpactValue} > ${this.policy.maxFinancialValue})`);
      return {
        status: 'REQUIRES_HUMAN_SUPERVISOR',
        isSafeToExecute: false,
        confidenceScore: confidence,
        reason: `Impact financier de ${financialImpactValue} excède le seuil automatique autorisé de ${this.policy.maxFinancialValue}. Validation humaine requise.`,
        violations,
        payload,
      };
    }

    // 3. Contrôle du seuil de confiance statistique
    if (confidence >= this.policy.minAutoConfidence) {
      return {
        status: 'AUTO_APPROVED',
        isSafeToExecute: true,
        confidenceScore: confidence,
        reason: `Score de confiance satisfaisant (${Math.round(confidence * 100)}% >= ${Math.round(this.policy.minAutoConfidence * 100)}%).`,
        violations: [],
        payload,
      };
    } else if (confidence >= this.policy.minHumanReviewConfidence) {
      violations.push('INDICE_CONFIANCE_MOYEN');
      return {
        status: 'REQUIRES_HUMAN_SUPERVISOR',
        isSafeToExecute: false,
        confidenceScore: confidence,
        reason: `Confiance modérée (${Math.round(confidence * 100)}%). Triage humain nécessaire pour éviter une décision erronée.`,
        violations,
        payload,
      };
    } else {
      violations.push('INCOMPREHENSIBLE_OU_HORS_SUJET');
      return {
        status: 'BLOCKED_RISK_VIOLATION',
        isSafeToExecute: false,
        confidenceScore: confidence,
        reason: `Score de confiance trop faible (${Math.round(confidence * 100)}%). Message incohérent ou hors périmètre.`,
        violations,
        payload,
      };
    }
  }
}
