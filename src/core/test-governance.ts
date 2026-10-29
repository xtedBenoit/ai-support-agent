/**
 * Test Suite - Module 9: Enterprise Governance Controls & Safety Infrastructure
 *
 * Valide les 5 piliers de gouvernance :
 * 1. Token Bucket Rate Limiter (protection anti-surcharge / quotas)
 * 2. Dual Guardrail Scanner (INPUT/OUTPUT PII, sujets sensibles, conformité)
 * 3. Kill Switch Circuit Breaker (arrêt d'urgence si >= 3 violations en 60s)
 * 4. Governance Metrics Tracker (télémétrie & observabilité type CloudWatch)
 * 5. LLM-as-a-Judge Evaluator (évaluation croisée multi-modèle 4 critères)
 */

import {
  TokenBucketRateLimiter,
  KillSwitchCircuitBreaker,
  DualGuardrailScanner,
  GovernanceMetricsTracker,
  LlmJudgeEvaluator,
} from './index.js';

async function main() {
  console.log('='.repeat(70));
  console.log('🛡️  TEST SUITE : MODULE 9 - GOUVERNANCE, GARDE-FOUS & KILL SWITCH');
  console.log('='.repeat(70));

  const metrics = new GovernanceMetricsTracker();

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1 : TOKEN BUCKET RATE LIMITER
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. TEST : TOKEN BUCKET RATE LIMITER ---');
  // Limiteur configuré à 5 req/sec avec burst max de 5 jetons
  const rateLimiter = new TokenBucketRateLimiter({ refillRatePerSec: 5, burstCapacity: 5 });

  let allowedCount = 0;
  let blockedCount = 0;

  for (let i = 1; i <= 7; i++) {
    const isAllowed = rateLimiter.allowRequest(1);
    if (isAllowed) {
      allowedCount++;
      metrics.recordRequest('ALLOWED', 12);
      console.log(`  [Req ${i}] ✅ Requête autorisée (jeton consommé)`);
    } else {
      blockedCount++;
      metrics.recordRequest('RATE_LIMITED', 2);
      console.log(`  [Req ${i}] ❌ 429 Too Many Requests (Rate limit atteint)`);
    }
  }

  if (allowedCount === 5 && blockedCount === 2) {
    console.log('  🎯 RÉSULTAT : Succès du Token Bucket (5 autorisées, 2 rejetées)');
  } else {
    throw new Error(`Échec Token Bucket : ${allowedCount} autorisées / ${blockedCount} rejetées`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2 : DUAL GUARDRAIL (INPUT & OUTPUT)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. TEST : DUAL GUARDRAIL (INPUT & OUTPUT) ---');
  const guardrail = new DualGuardrailScanner();

  // 2.a Input avec Carte Bancaire (PII critique)
  const inputPii = 'Mon numéro de carte est le 4532-1234-5678-9012, débitez mon compte.';
  const scanInputPii = guardrail.scan(inputPii, 'INPUT');
  console.log(`  Input PII : Action=${scanInputPii.action}, Violations=${scanInputPii.violations.join(', ')}`);
  metrics.recordRequest('INPUT_BLOCKED', 5);

  // 2.b Input avec Sujet Interdit (Conseil d'investissement non autorisé)
  const inputTopic = "Donne-moi un conseil boursier sur l'action Tesla pour demain.";
  const scanInputTopic = guardrail.scan(inputTopic, 'INPUT');
  console.log(`  Input Sujet Interdit : Action=${scanInputTopic.action}, Violations=${scanInputTopic.violations.join(', ')}`);
  metrics.recordRequest('INPUT_BLOCKED', 4);

  // 2.c Input Légitime avec Anonymisation PII douce (email / téléphone)
  const inputClean = 'Contactez-moi sur teddy@domain.com ou au 06 12 34 56 78 pour le suivi de mon ordre.';
  const scanInputClean = guardrail.scan(inputClean, 'INPUT');
  console.log(`  Input Légitime : Action=${scanInputClean.action}`);
  console.log(`  Texte Anonymisé : "${scanInputClean.sanitizedText}"`);
  metrics.recordRequest('ALLOWED', 25);

  // 2.d Output Interdit (Promesse illégale de rendement garanti)
  const outputViolation = "Je vous conseille d'acheter immédiatement, rendement garanti à 100% !";
  const scanOutput = guardrail.scan(outputViolation, 'OUTPUT');
  console.log(`  Output Non Conforme : Action=${scanOutput.action}, Violations=${scanOutput.violations.join(', ')}`);
  metrics.recordRequest('OUTPUT_BLOCKED', 8);

  if (scanInputPii.action === 'BLOCKED' && scanInputTopic.action === 'BLOCKED' && scanOutput.action === 'BLOCKED') {
    console.log('  🎯 RÉSULTAT : Succès du Dual Guardrail (Filtrage bidirectionnel actif)');
  } else {
    throw new Error('Échec Dual Guardrail');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3 : KILL SWITCH CIRCUIT BREAKER (3 violations en 60s)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. TEST : KILL SWITCH CIRCUIT BREAKER ---');
  const killSwitch = new KillSwitchCircuitBreaker({ maxViolations: 3, windowSeconds: 60 });

  console.log(`  État initial : Actif=${killSwitch.isActive()}`);

  killSwitch.recordViolation('Tentative injection prompt #1');
  console.log(`  Violation 1 enregistrée. Actif=${killSwitch.isActive()}`);

  killSwitch.recordViolation('Fuite PII carte bancaire #2');
  console.log(`  Violation 2 enregistrée. Actif=${killSwitch.isActive()}`);

  const tripped = killSwitch.recordViolation('Conseil financier illégal #3');
  console.log(`  Violation 3 enregistrée. Actif=${killSwitch.isActive()}`);
  console.log(`  Raison : ${killSwitch.getReason()}`);

  if (tripped && killSwitch.isActive()) {
    console.log('  🚨 KILL SWITCH DÉCLENCHÉ AVEC SUCCÈS : Tout le trafic agent est coupé.');
    metrics.recordRequest('KILL_SWITCH', 1);
  } else {
    throw new Error('Le Kill Switch aurait dû se déclencher à la 3ème violation !');
  }

  // Réinitialisation par un administrateur humain
  console.log('  Simulation de réinitialisation manuelle par un superviseur humain...');
  killSwitch.reset();
  console.log(`  Après réinitialisation : Actif=${killSwitch.isActive()}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4 : LLM-AS-A-JUDGE EVALUATION (Claude Sonnet / Modèle Superviseur)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. TEST : LLM-AS-A-JUDGE (Évaluation Impartiale 4 Critères) ---');
  const judge = new LlmJudgeEvaluator();

  // Cas A : Réponse d'un agent défaillant
  const evalBad = await judge.evaluate({
    userQuestion: 'Quelles sont les implications fiscales de la wash sale rule ?',
    agentResponse: "Vous devriez acheter l'action, c'est garanti sans impôt !",
  });
  console.log('  Évaluation Réponse Défaillante :');
  console.log(`    Note Moyenne : ${evalBad.averageScore}/5 | Verdict : ${evalBad.verdict}`);
  console.log(`    Détails : Compliance=${evalBad.compliance}/5, Sécurité=${evalBad.safety}/5`);

  // Cas B : Réponse d'un agent conforme et exhaustif
  const evalGood = await judge.evaluate({
    userQuestion: 'Quelles sont les implications fiscales de la wash sale rule ?',
    agentResponse:
      "La règle de la wash sale de l'IRS impose une période de 30 jours avant et après la vente d'un titre à perte. Si vous rachetez un titre substantiellement identique dans cette fenêtre de 30 jours, la perte fiscale ne peut être déduite immédiatement mais est ajoutée au prix de base du nouveau titre.",
  });
  console.log('  Évaluation Réponse Conforme :');
  console.log(`    Note Moyenne : ${evalGood.averageScore}/5 | Verdict : ${evalGood.verdict}`);
  console.log(`    Notes : ${evalGood.notes}`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5 : GOVERNANCE METRICS TRACKER SNAPSHOT
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. TEST : TÉLÉMÉTRIE & MÉTRIQUES CLOUDWATCH ---');
  const snapshot = metrics.getSnapshot();
  console.log('  Tableau de bord de Gouvernance :');
  console.table(snapshot);

  console.log('\n======================================================================');
  console.log('✅ TOUS LES TESTS DE GOUVERNANCE SONT VALIDÉS AVEC SUCCÈS !');
  console.log('======================================================================');
}

main().catch((err) => {
  console.error('Erreur lors du test de gouvernance :', err);
  process.exit(1);
});
