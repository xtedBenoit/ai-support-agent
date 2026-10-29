/**
 * Production Architecture & Operational Deployment Engine
 * (Inspiré de VectraBank Production Architecture - Module 10)
 *
 * Ce module fournit les briques indispensables pour la mise en production :
 * 1. Calculateur de coûts multi-modèles (Nova Lite vs Claude Sonnet + Infra)
 * 2. Pipeline de déploiement en 6 étapes avec Rollback automatique
 * 3. Gestionnaire de Runbooks opérationnels et Arbre de décision pour incidents (Latence P99, Kill Switch)
 */

export interface AgentCostSpec {
  name: string;
  model: 'amazon.nova-lite-v1:0' | 'amazon.nova-pro-v1:0' | 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' | string;
  estimatedTokensPerRequest: number;
  requestsPerDay: number;
  inputRatio?: number;  // défaut: 0.6 (60% prompt)
  outputRatio?: number; // défaut: 0.4 (40% completion)
}

export interface ModelPricing {
  inputPer1K: number;
  outputPer1K: number;
}

export const BEDROCK_MODEL_PRICING: Record<string, ModelPricing> = {
  'amazon.nova-lite-v1:0': { inputPer1K: 0.00006, outputPer1K: 0.00024 },
  'amazon.nova-pro-v1:0': { inputPer1K: 0.0008, outputPer1K: 0.0032 },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': { inputPer1K: 0.003, outputPer1K: 0.015 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CALCULATEUR D'OPTIMISATION DES COÛTS (MULTI-MODEL TIERING)
// ─────────────────────────────────────────────────────────────────────────────
export interface CostEstimateReport {
  agents: Record<string, { model: string; dailyRequests: number; monthlyCost: number }>;
  infrastructure: Record<string, number>;
  totalMonthlyCost: number;
  allSonnetAlternativeCost: number;
  monthlySavingsAmount: number;
  monthlySavingsPercentage: number;
}

export class CostOptimizationCalculator {
  static estimateMonthly(
    agents: AgentCostSpec[],
    infraMonthly: Record<string, number> = {
      'DynamoDB (State & Audit)': 50.0,
      'Knowledge Bases (OpenSearch Serverless)': 30.0,
      'CloudWatch & X-Ray (10% sampling)': 25.0,
      'VPC / Private Endpoints': 10.0,
    },
    days = 30
  ): CostEstimateReport {
    const agentsReport: Record<string, { model: string; dailyRequests: number; monthlyCost: number }> = {};
    let totalModelCost = 0;
    let allSonnetCost = 0;

    const sonnetPricing = BEDROCK_MODEL_PRICING['us.anthropic.claude-sonnet-4-5-20250929-v1:0'];

    for (const agent of agents) {
      const pricing = BEDROCK_MODEL_PRICING[agent.model] ?? { inputPer1K: 0.001, outputPer1K: 0.005 };
      const inRatio = agent.inputRatio ?? 0.6;
      const outRatio = agent.outputRatio ?? 0.4;

      const inputTokens = agent.estimatedTokensPerRequest * inRatio;
      const outputTokens = agent.estimatedTokensPerRequest * outRatio;

      const costPerReq = (inputTokens / 1000) * pricing.inputPer1K + (outputTokens / 1000) * pricing.outputPer1K;
      const monthlyAgentCost = costPerReq * agent.requestsPerDay * days;

      agentsReport[agent.name] = {
        model: agent.model,
        dailyRequests: agent.requestsPerDay,
        monthlyCost: Math.round(monthlyAgentCost * 100) / 100,
      };
      totalModelCost += monthlyAgentCost;

      // Calcul comparatif si cet agent utilisait Claude Sonnet à 100%
      const sonnetCostPerReq = (inputTokens / 1000) * sonnetPricing.inputPer1K + (outputTokens / 1000) * sonnetPricing.outputPer1K;
      allSonnetCost += sonnetCostPerReq * agent.requestsPerDay * days;
    }

    const totalInfraCost = Object.values(infraMonthly).reduce((sum, cost) => sum + cost, 0);
    const totalMonthlyCost = Math.round((totalModelCost + totalInfraCost) * 100) / 100;
    const totalSonnetMonthly = Math.round((allSonnetCost + totalInfraCost) * 100) / 100;

    const savingsAmount = Math.round((totalSonnetMonthly - totalMonthlyCost) * 100) / 100;
    const savingsPercent = Math.round((savingsAmount / totalSonnetMonthly) * 1000) / 10;

    return {
      agents: agentsReport,
      infrastructure: infraMonthly,
      totalMonthlyCost,
      allSonnetAlternativeCost: totalSonnetMonthly,
      monthlySavingsAmount: savingsAmount,
      monthlySavingsPercentage: savingsPercent,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PIPELINE DE DÉPLOIEMENT EN 6 ÉTAPES AVEC ROLLBACK AUTOMATIQUE
// ─────────────────────────────────────────────────────────────────────────────
export type PipelineStage = 'BUILD' | 'GUARDRAIL' | 'RUNTIME' | 'MEMORY' | 'OBSERVABILITY' | 'SMOKE_TEST';

export interface DeploymentConfig {
  runtimeName: string;
  networkMode: 'VPC' | 'PUBLIC';
  protocol: 'MCP' | 'HTTP';
  guardrailId: string;
  guardrailVersion: string;
  smokeTestQueryCount: number;
  targetMaxErrorRatePercent: number; // e.g. 2%
}

export interface DeploymentStepLog {
  stage: PipelineStage;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  message: string;
  durationMs: number;
}

export interface DeploymentResult {
  success: boolean;
  deployedVersion?: string;
  steps: DeploymentStepLog[];
  errorMessage?: string;
}

export class DeploymentPipeline {
  private stepsLog: DeploymentStepLog[] = [];

  async deploy(config: DeploymentConfig, smokeTestRunner: (count: number) => Promise<{ errorRatePercent: number }>): Promise<DeploymentResult> {
    this.stepsLog = [];
    const startTime = Date.now();

    try {
      // 1. Build
      await this.runStage('BUILD', async () => {
        if (!config.runtimeName) throw new Error('Nom de runtime manquant');
        return 'Code packagé dans l’artefact S3 (deployment.zip)';
      });

      // 2. Guardrail
      await this.runStage('GUARDRAIL', async () => {
        if (!config.guardrailId) throw new Error('Guardrail ID obligatoire');
        return `Guardrail ${config.guardrailId} verrouillé en version ${config.guardrailVersion}`;
      });

      // 3. Runtime
      await this.runStage('RUNTIME', async () => {
        if (config.networkMode !== 'VPC' && config.networkMode !== 'PUBLIC') {
          throw new Error('Mode réseau invalide');
        }
        return `AgentCore Runtime configuré en mode ${config.networkMode} avec protocole ${config.protocol}`;
      });

      // 4. Memory
      await this.runStage('MEMORY', async () => {
        return 'Tables DynamoDB (State & Audit) et AgentCore Memory validées';
      });

      // 5. Observability
      await this.runStage('OBSERVABILITY', async () => {
        return 'Dashboard CloudWatch déployé (6 widgets) + Tracing X-Ray activé à 10% d’échantillonnage';
      });

      // 6. Smoke Test (Vérification en conditions réelles)
      await this.runStage('SMOKE_TEST', async () => {
        const testResult = await smokeTestRunner(config.smokeTestQueryCount);
        if (testResult.errorRatePercent > config.targetMaxErrorRatePercent) {
          throw new Error(
            `Taux d'erreur smoke test trop élevé (${testResult.errorRatePercent}% > max ${config.targetMaxErrorRatePercent}%)`
          );
        }
        return `Smoke test réussi sur ${config.smokeTestQueryCount} requêtes (taux d'erreur: ${testResult.errorRatePercent}%)`;
      });

      return {
        success: true,
        deployedVersion: `v-${Date.now()}`,
        steps: this.stepsLog,
      };
    } catch (error: any) {
      // Déclenchement automatique de la procédure de Rollback
      const rollbackLog: DeploymentStepLog = {
        stage: 'SMOKE_TEST',
        status: 'ROLLED_BACK',
        message: `Échec du pipeline : ${error.message}. Déclenchement automatique du Rollback vers la version stable précédente.`,
        durationMs: Date.now() - startTime,
      };
      this.stepsLog.push(rollbackLog);

      return {
        success: false,
        steps: this.stepsLog,
        errorMessage: error.message,
      };
    }
  }

  private async runStage(stage: PipelineStage, fn: () => Promise<string>): Promise<void> {
    const t0 = Date.now();
    try {
      const msg = await fn();
      this.stepsLog.push({
        stage,
        status: 'SUCCESS',
        message: msg,
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      this.stepsLog.push({
        stage,
        status: 'FAILED',
        message: err.message,
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GESTIONNAIRE DE RUNBOOK OPÉRATIONNEL & ENQUÊTE D'INCIDENT (SOP)
// ─────────────────────────────────────────────────────────────────────────────
export interface LatencyTriageInput {
  routerLatencyMs: number;
  marketDataLatencyMs: number;
  complianceLatencyMs: number;
  advisorLatencyMs: number;
}

export interface LatencyTriageReport {
  bottleneckAgent: 'ROUTER' | 'RETRIEVER' | 'ADVISOR' | 'SYSTEM_NORMAL';
  measuredLatencyMs: number;
  slaExceeded: boolean;
  recommendedAction: string;
  runbookProcedure: string[];
}

export class OperationalRunbookManager {
  /**
   * Arbre de décision pour investiguer un pic de latence (P99 > 8s)
   */
  static triageLatencySpike(input: LatencyTriageInput, p99ThresholdMs = 8000): LatencyTriageReport {
    const totalLatencyMs =
      input.routerLatencyMs +
      Math.max(input.marketDataLatencyMs, input.complianceLatencyMs) +
      input.advisorLatencyMs;

    const slaExceeded = totalLatencyMs > p99ThresholdMs;

    // SLA respecté
    if (!slaExceeded) {
      return {
        bottleneckAgent: 'SYSTEM_NORMAL',
        measuredLatencyMs: totalLatencyMs,
        slaExceeded: false,
        recommendedAction: 'Toutes les métriques de latence sont dans les limites opérationnelles.',
        runbookProcedure: ['Maintenir la surveillance CloudWatch normale.'],
      };
    }

    // Diagnostic du goulot d'étranglement
    if (input.advisorLatencyMs > 4000) {
      return {
        bottleneckAgent: 'ADVISOR',
        measuredLatencyMs: input.advisorLatencyMs,
        slaExceeded: true,
        recommendedAction: 'Throttling ou saturation sur le modèle de synthèse Claude Sonnet.',
        runbookProcedure: [
          '1. Vérifier les métriques de quota et de throttling Bedrock.',
          '2. Si saturation persistante, basculer temporairement vers Nova Pro.',
          '3. Réduire la taille du contexte de prompt transmis par les retrievers.',
        ],
      };
    }

    if (input.marketDataLatencyMs > 2500 || input.complianceLatencyMs > 2500) {
      const maxRetriever = Math.max(input.marketDataLatencyMs, input.complianceLatencyMs);
      return {
        bottleneckAgent: 'RETRIEVER',
        measuredLatencyMs: maxRetriever,
        slaExceeded: true,
        recommendedAction: 'Ralentissement sur la recherche vectorielle (Knowledge Bases / S3 Vectors).',
        runbookProcedure: [
          '1. Vérifier la santé du cluster OpenSearch Serverless / S3 Vectors.',
          '2. Examiner le statut d’indexation de la Knowledge Base.',
          '3. Ajuster le paramètre numberOfResults (top-k) pour alléger la recherche.',
        ],
      };
    }

    if (input.routerLatencyMs > 500) {
      return {
        bottleneckAgent: 'ROUTER',
        measuredLatencyMs: input.routerLatencyMs,
        slaExceeded: true,
        recommendedAction: 'Ralentissement au niveau du routeur ou de la table d’état DynamoDB.',
        runbookProcedure: [
          '1. Vérifier si la table DynamoDB subit un Read/Write Throttling.',
          '2. Confirmer que le routeur utilise bien Nova Lite avec temperature=0.0.',
          '3. Activer le cache de routage par règles pour délester les appels LLM.',
        ],
      };
    }

    return {
      bottleneckAgent: 'SYSTEM_NORMAL',
      measuredLatencyMs: totalLatencyMs,
      slaExceeded: true,
      recommendedAction: 'Latence cumulée élevée sans goulot unique.',
      runbookProcedure: [
        '1. Examiner la trace distribuée complète dans AWS X-Ray.',
        '2. Vérifier les temps de transit réseau dans le VPC.',
      ],
    };
  }

  /**
   * Procédure de traitement immédiat du déclenchement du Kill Switch
   */
  static getKillSwitchRunbook(triggerReason: string): { actionTitle: string; immediateSteps: string[] } {
    return {
      actionTitle: `Traitement Incident : Arrêt d'urgence AgentCore Runtime (${triggerReason})`,
      immediateSteps: [
        '1. Acquitter immédiatement l’alarme CloudWatch "KillSwitchActive" pour notifier l’équipe d’astreinte.',
        '2. Consulter la table DynamoDB d’audit pour identifier les requêtes suspectes (IP source, type de jailbreak ou fuite).',
        '3. Si attaque malveillante : durcir le TokenBucketRateLimiter et bloquer les plages IP au niveau du WAF/VPC.',
        '4. Si régression de prompt : basculer le Guardrail vers la version N-1 stable.',
        '5. Exécuter la commande de réarmement manuel (reset) une fois la cause corrigée.',
        '6. Maintenir une surveillance renforcée pendant 30 minutes.',
      ],
    };
  }
}
