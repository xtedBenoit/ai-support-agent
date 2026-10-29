/**
 * Test Suite - Module 10: Production Architecture, Cost Engine & Runbooks
 *
 * Valide les composants clés de VectraBank Production :
 * 1. Calculateur de coûts multi-modèles (Nova Lite vs Claude Sonnet)
 * 2. Pipeline de déploiement en 6 étapes & Rollback automatique
 * 3. Gestionnaire de Runbooks et Diagnostic d'incident de latence (P99 > 8s)
 */

import {
  CostOptimizationCalculator,
  DeploymentPipeline,
  OperationalRunbookManager,
  AgentCostSpec,
  DeploymentConfig,
} from './index.js';

async function main() {
  console.log('='.repeat(75));
  console.log('🏛️  TEST SUITE : MODULE 10 - VECTRABANK PRODUCTION ARCHITECTURE');
  console.log('='.repeat(75));

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1 : OPTIMISATION ET ESTIMATION DES COÛTS (MULTI-MODEL TIERING)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. TEST : CALCULATEUR DE COÛTS MULTI-MODÈLES (VectraBank 10K req/jour) ---');

  const vectrabankAgents: AgentCostSpec[] = [
    {
      name: 'QueryRouter',
      model: 'amazon.nova-lite-v1:0',
      estimatedTokensPerRequest: 400,
      requestsPerDay: 10000,
    },
    {
      name: 'MarketDataRetriever',
      model: 'amazon.nova-lite-v1:0',
      estimatedTokensPerRequest: 600,
      requestsPerDay: 6000,
    },
    {
      name: 'ComplianceRetriever',
      model: 'amazon.nova-lite-v1:0',
      estimatedTokensPerRequest: 600,
      requestsPerDay: 4000,
    },
    {
      name: 'FinancialAdvisor',
      model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      estimatedTokensPerRequest: 2500,
      requestsPerDay: 10000,
    },
  ];

  const costReport = CostOptimizationCalculator.estimateMonthly(vectrabankAgents);

  console.log('  Détail par agent :');
  for (const [name, detail] of Object.entries(costReport.agents)) {
    console.log(`    - ${name.padEnd(22)} | Modèle: ${detail.model.padEnd(45)} | $${detail.monthlyCost.toFixed(2)}/mois`);
  }

  console.log('\n  Coûts d’Infrastructure fixe :');
  for (const [infra, cost] of Object.entries(costReport.infrastructure)) {
    console.log(`    - ${infra.padEnd(38)} : $${cost.toFixed(2)}/mois`);
  }

  console.log('\n  📊 SYNTHÈSE BUDGÉTAIRE :');
  console.log(`    Coût Total Réel (Architecture Hybride)  : $${costReport.totalMonthlyCost.toFixed(2)}/mois`);
  console.log(`    Coût si 100% Claude Sonnet              : $${costReport.allSonnetAlternativeCost.toFixed(2)}/mois`);
  console.log(`    💰 Économie Mensuelle Réalisée          : $${costReport.monthlySavingsAmount.toFixed(2)}/mois (${costReport.monthlySavingsPercentage}%)`);

  if (costReport.totalMonthlyCost > 5000 && costReport.totalMonthlyCost < 7500) {
    console.log('  🎯 RÉSULTAT : Estimation alignée avec le budget cible (~$6,000/mois @ 10K req/jour).');
  } else {
    throw new Error(`Estimation inattendue : $${costReport.totalMonthlyCost}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2 : PIPELINE DE DÉPLOIEMENT EN 6 ÉTAPES
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. TEST : PIPELINE DE DÉPLOIEMENT EN 6 ÉTAPES ---');
  const pipeline = new DeploymentPipeline();

  const deployConfig: DeploymentConfig = {
    runtimeName: 'vectrabank_financial_services',
    networkMode: 'VPC',
    protocol: 'MCP',
    guardrailId: 'gr-vectrabank-compliance',
    guardrailVersion: 'v1.0',
    smokeTestQueryCount: 20,
    targetMaxErrorRatePercent: 2.0, // Tolérance max 2%
  };

  // 2.a Déploiement réussi
  console.log('  [Cas A] Déploiement nominal avec smoke test conforme :');
  const nominalResult = await pipeline.deploy(deployConfig, async () => ({
    errorRatePercent: 0.0, // 0% d'erreur
  }));

  for (const step of nominalResult.steps) {
    console.log(`    [${step.stage.padEnd(14)}] ${step.status === 'SUCCESS' ? '✅' : '❌'} ${step.message} (${step.durationMs}ms)`);
  }

  if (!nominalResult.success) {
    throw new Error('Le déploiement nominal aurait dû réussir');
  }
  console.log(`    🚀 Déploiement validé ! Version active : ${nominalResult.deployedVersion}`);

  // 2.b Déploiement avec Rollback automatique (smoke test en échec)
  console.log('\n  [Cas B] Déploiement avec régression (smoke test error rate = 5.0% > 2.0%) :');
  const failingResult = await pipeline.deploy(deployConfig, async () => ({
    errorRatePercent: 5.0, // Trop d'erreurs
  }));

  const lastStep = failingResult.steps[failingResult.steps.length - 1];
  console.log(`    Statut final : ${failingResult.success ? 'SUCCÈS' : 'ÉCHEC GÉRÉ'}`);
  console.log(`    Action automatique : 🔄 ${lastStep.message}`);

  if (failingResult.success || lastStep.status !== 'ROLLED_BACK') {
    throw new Error('Le rollback automatique aurait dû se déclencher !');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3 : RUNBOOK OPÉRATIONNEL & DIAGNOSTIC DE LATENCE P99
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. TEST : DIAGNOSTIC D’INCIDENT ET RUNBOOKS (P99 > 8s) ---');

  // Diagnostic 1 : Goulot d'étranglement Advisor (Claude Sonnet)
  const reportAdvisor = OperationalRunbookManager.triageLatencySpike({
    routerLatencyMs: 150,
    marketDataLatencyMs: 900,
    complianceLatencyMs: 850,
    advisorLatencyMs: 7200, // Bloqué sur le modèle de synthèse
  });
  console.log(`  Diagnostic Latence (Advisor) : Goulot = ${reportAdvisor.bottleneckAgent} (${reportAdvisor.measuredLatencyMs}ms)`);
  console.log(`    Action recommandée : ${reportAdvisor.recommendedAction}`);
  console.log(`    Procédure du Runbook : ${reportAdvisor.runbookProcedure[0]}`);

  // Diagnostic 2 : Goulot d'étranglement Knowledge Base / Retriever
  const reportRetriever = OperationalRunbookManager.triageLatencySpike({
    routerLatencyMs: 120,
    marketDataLatencyMs: 4200, // OpenSearch / KB saturé
    complianceLatencyMs: 600,
    advisorLatencyMs: 3800,
  });
  console.log(`\n  Diagnostic Latence (Retriever) : Goulot = ${reportRetriever.bottleneckAgent} (${reportRetriever.measuredLatencyMs}ms)`);
  console.log(`    Action recommandée : ${reportRetriever.recommendedAction}`);

  // Fiche Runbook Kill Switch
  console.log('\n  Fiche Runbook Kill Switch :');
  const ksRunbook = OperationalRunbookManager.getKillSwitchRunbook('Détection de 3 tentatives d’injection de prompt');
  console.log(`    Titre : ${ksRunbook.actionTitle}`);
  console.log(`    Étape 1 : ${ksRunbook.immediateSteps[0]}`);
  console.log(`    Étape 2 : ${ksRunbook.immediateSteps[1]}`);

  console.log('\n===========================================================================');
  console.log('✅ TOUS LES TESTS D’ARCHITECTURE DE PRODUCTION SONT VALIDÉS AVEC SUCCÈS !');
  console.log('===========================================================================');
}

main().catch((err) => {
  console.error('Erreur critique :', err);
  process.exit(1);
});
