import {
  withRetry,
  cleanThinkingTags,
  safeJsonExtract,
  maskPii,
  GuardrailEngine,
  CascadingRouter,
} from './index.js';

async function main() {
  console.log('═'.repeat(75));
  console.log('  DÉMONSTRATION DU CORE MULTI-AGENT TOOLKIT (Notre SDK Interne)');
  console.log('  5 Outils d\'Architecture Réutilisables en Production');
  console.log('═'.repeat(75));

  // ── TEST 1 : Résilience & Retry avec Jitter ──
  console.log('\n[1/5] TEST DE RÉSILIENCE (withRetry)...');
  let attemptCount = 0;
  const resilientResult = await withRetry(
    async (attempt) => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('ThrottlingException: Rate exceeded (HTTP 429)');
      }
      return 'Réponse Bedrock reçue avec succès après retry !';
    },
    { maxRetries: 3, baseDelayMs: 300, label: 'BedrockConverseCall' }
  );
  console.log(`  ✓ Résultat : ${resilientResult}`);

  // ── TEST 2 : Nettoyage Thinking Tags & JSON Extract ──
  console.log('\n[2/5] TEST DU RESPONSE SANITIZER...');
  const rawModelResponse = `
    <thinking>
      L'utilisateur veut une veste moto taille L en stock à Lomé.
      Je dois chercher dans le catalogue.
    </thinking>
    Voici les données trouvées :
    \`\`\`json
    {
      "status": "success",
      "article": "Veste Moto Renforcée",
      "priceFcfa": 35000,
      "inStock": true
    }
    \`\`\`
  `;
  const cleanJson = safeJsonExtract(rawModelResponse);
  console.log('  ✓ JSON extrait proprement sans pollution <thinking> :');
  console.log(`    Article: ${cleanJson.article} | Prix: ${cleanJson.priceFcfa} FCFA`);

  // ── TEST 3 : Masquage PII ──
  console.log('\n[3/5] TEST DE MASQUAGE PII...');
  const sensitiveUserPrompt = 'Mon email est koffi.mensah@gmail.com et ma carte est 4532 8920 1234 5678, remboursez-moi.';
  console.log(`  • Texte original : "${sensitiveUserPrompt}"`);
  console.log(`  • Texte masqué   : "${maskPii(sensitiveUserPrompt)}"`);

  // ── TEST 4 : Guardrail Engine (Seuils & Circuit Breaker) ──
  console.log('\n[4/5] TEST DU GUARDRAIL ENGINE...');
  const guardrail = new GuardrailEngine({
    minAutoConfidence: 0.75,
    maxFinancialValue: 3000,
  });

  const evalAuto = guardrail.evaluate({ confidence: 0.92, financialImpactValue: 800 });
  console.log(`  ✓ Remboursement 800 FCFA (Confiance 92%) : ${evalAuto.status} (${evalAuto.reason})`);

  const evalThreshold = guardrail.evaluate({ confidence: 0.95, financialImpactValue: 6000 });
  console.log(`  ⚠️ Remboursement 6000 FCFA (> 3000 FCFA) : ${evalThreshold.status} (${evalThreshold.reason})`);

  const evalUncertain = guardrail.evaluate({ confidence: 0.55 });
  console.log(`  ⚠️ Demande ambiguë (Confiance 55%)       : ${evalUncertain.status} (${evalUncertain.reason})`);

  // ── TEST 5 : Cascading Router Framework ──
  console.log('\n[5/5] TEST DU CASCADING ROUTER (4 Paliers)...');
  type AgentType = 'EMERGENCY_SUPPORT' | 'BILLING' | 'TECHNICAL' | 'AI_PRODUCT' | 'HUMAN_FALLBACK';

  const router = new CascadingRouter<AgentType>({
    priorityRules: [
      { pattern: /\b(accident|police|danger|agression|urgenc\w*)\b/i, target: 'EMERGENCY_SUPPORT', label: 'Sécurité/Accident' },
    ],
    deterministicRules: [
      { pattern: /\b(factur\w*|rembours\w*|payer|debit\w*)\b/i, target: 'BILLING', label: 'Facturation/Paiement' },
      { pattern: /\b(panne|marche pas|connexion|bug|erreur)\b/i, target: 'TECHNICAL', label: 'Support Technique' },
    ],
    llmClassifier: async (text: string) => {
      // Simule une classification sémantique
      if (text.includes('chaussure') || text.includes('taille')) {
        return { target: 'AI_PRODUCT', confidence: 0.91, reason: 'Recherche de vêtements' };
      }
      return { target: 'HUMAN_FALLBACK', confidence: 0.35, reason: 'Incompréhensible' };
    },
    fallbackTarget: 'HUMAN_FALLBACK',
    confidenceThreshold: 0.60,
  });

  const testRequests = [
    { id: 'REQ-01', text: 'Urgence ! Le chauffeur a eu un accident au carrefour Déckon !' },
    { id: 'REQ-02', text: 'Vous m\'avez facturé deux fois 1500 FCFA pour ma course.' },
    { id: 'REQ-03', text: 'Je cherche des chaussures de sport taille 43 en promotion.' },
    { id: 'REQ-04', text: 'Abracadabra blabla pouf pouf licorne.' },
  ];

  for (const req of testRequests) {
    const route = await router.route(req.id, req.text);
    console.log(`  • [${req.id}] "${req.text.slice(0, 45)}..."`);
    console.log(`    👉 Aiguillé vers: ${route.target} | Méthode: ${route.method} (${Math.round(route.latencyMs * 10) / 10} ms)`);
  }

  // ── Rapport d'Audit Synthétique ──
  console.log('\n📊 RAPPORT DU MOTEUR D\'AUDIT (DynamoDB Metrics) :');
  const summary = router.getAuditEngine().getMetricsSummary();
  console.log(`  • Total requêtes auditées : ${summary.totalRecords}`);
  console.log(`  • Répartition méthodes    : ${JSON.stringify(summary.distributionByMethod)}`);
  console.log(`  • Latence moyenne         : ${summary.averageLatencyMs} ms`);

  console.log(`\n${'═'.repeat(75)}`);
  console.log('  🎉 Toolkit validé : 5 briques prêtes à être importées dans tout le projet !');
  console.log('═'.repeat(75));
}

main().catch(console.error);
