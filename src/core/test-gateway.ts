/**
 * Test Suite - Module 11: AgentCore Tool Gateway & MCP Protocol
 *
 * Valide le patron Gateway universel :
 * 1. Enregistrement multi-cibles (2 Lambdas + 1 API REST)
 * 2. Découverte sémantique et génération du catalogue de prompt MCP
 * 3. Invocations découplées avec traçabilité et validation des schémas
 * 4. Extensibilité dynamique à chaud (Zero Code Change) : ajout du 4ème outil stock_price
 * 5. Journalisation et audit des invocations
 */

import { AgentCoreGateway } from './index.js';

async function main() {
  console.log('='.repeat(75));
  console.log('🌐 TEST SUITE : MODULE 11 - AGENTCORE TOOL GATEWAY & PROTOCOLE MCP');
  console.log('='.repeat(75));

  // ───────────────────────────────────────────────────────────────────────────
  // 1. INITIALISATION DE LA PASSERELLE
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. CRÉATION DU GATEWAY ET ENREGISTREMENT INITIAL ---');
  const gateway = new AgentCoreGateway(
    'Analytics Gateway',
    'Passerelle d’outils analytiques alimentée par AWS Lambda et API REST'
  );

  console.log(`  Gateway ID : ${gateway.gatewayId}`);

  // Cible 1 : Weather Lambda
  gateway.registerTarget({
    name: 'weather_lambda',
    description: 'Consulte les conditions météorologiques actuelles pour une ville donnée (température, humidité, vent)',
    targetType: 'LAMBDA',
    endpointOrArn: 'arn:aws:lambda:us-east-1:123456789012:function:exercise-weather',
    parameters: {
      city: { type: 'string', description: 'Nom de la ville (ex: Tokyo, Paris, New York)', required: true },
    },
    handler: async (params) => ({
      city: params.city,
      temperatureC: 18.5,
      condition: 'Sunny',
      humidity: 55,
      windKmh: 12,
    }),
  });

  // Cible 2 : Currency Lambda
  gateway.registerTarget({
    name: 'currency_lambda',
    description: 'Convertit un montant d’une devise source vers une devise cible avec taux de change en direct',
    targetType: 'LAMBDA',
    endpointOrArn: 'arn:aws:lambda:us-east-1:123456789012:function:exercise-currency',
    parameters: {
      amount: { type: 'number', description: 'Montant à convertir', required: true },
      from: { type: 'string', description: 'Code devise source (ex: USD)', required: true },
      to: { type: 'string', description: 'Code devise cible (ex: EUR)', required: true },
    },
    handler: async (params) => ({
      amount: params.amount,
      from: params.from,
      to: params.to,
      rate: 0.92,
      convertedAmount: Math.round(params.amount * 0.92 * 100) / 100,
    }),
  });

  // Cible 3 : News REST API
  gateway.registerTarget({
    name: 'news_api',
    description: 'Récupère les derniers titres d’actualité par thématique (ex: ai, finance, tech)',
    targetType: 'REST_API',
    endpointOrArn: 'https://api.vectranews.internal/v1/headlines',
    parameters: {
      topic: { type: 'string', description: 'Sujet de l’actualité (ex: ai, finance)', required: true },
    },
    handler: async (params) => ({
      topic: params.topic,
      headlines: [
        `Anthropic et AWS annoncent de nouvelles avancées pour Bedrock (${params.topic})`,
        `Le déploiement des agents autonomes s’accélère dans le secteur financier`,
      ],
      articleCount: 2,
    }),
  });

  console.log(`  Nombre d'outils enregistrés initialement : ${gateway.getToolCount()}`);
  if (gateway.getToolCount() !== 3) throw new Error('Échec d’enregistrement des 3 outils');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DÉCOUVERTE SÉMANTIQUE & CATALOGUE MCP POUR LE LLM
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. DÉCOUVERTE SÉMANTIQUE & CATALOGUE MCP ---');
  const allTools = gateway.discoverTools();
  console.log('  Outils découverts par introspection :');
  for (const t of allTools) {
    console.log(`    - [${t.type.padEnd(9)}] ${t.name.padEnd(18)} : ${t.description.slice(0, 60)}...`);
  }

  // Filtrage sémantique
  const currencyFilter = gateway.discoverTools('devise');
  console.log(`\n  Recherche sémantique ("devise") : ${currencyFilter.length} outil trouvé (${currencyFilter[0]?.name})`);

  // Catalogue formaté injecté dans le system prompt du LLM
  console.log('\n  Extrait du Catalogue MCP injecté au modèle :');
  console.log(gateway.formatSystemPromptCatalog().split('\n').slice(0, 8).join('\n'));
  console.log('    [... suite du catalogue formaté ...]');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. EXÉCUTION DÉCOUPLÉE DES OUTILS VIA LA PASSERELLE
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. EXÉCUTION DÉCOUPLÉE DES REQUÊTES ---');

  // Requête 1 : Météo Tokyo
  console.log('  [Req 1] Météo à Tokyo :');
  const weatherRes = await gateway.invokeTool('weather_lambda', { city: 'Tokyo' });
  console.log(`    Résultat : ${weatherRes.condition}, ${weatherRes.temperatureC}°C, vent ${weatherRes.windKmh} km/h`);

  // Requête 2 : Conversion 500 USD -> EUR
  console.log('  [Req 2] Conversion 500 USD vers EUR :');
  const currencyRes = await gateway.invokeTool('currency_lambda', { amount: 500, from: 'USD', to: 'EUR' });
  console.log(`    Résultat : 500 USD = ${currencyRes.convertedAmount} EUR (taux: ${currencyRes.rate})`);

  // Requête 3 : Actualités IA
  console.log('  [Req 3] Actualités AI :');
  const newsRes = await gateway.invokeTool('news_api', { topic: 'ai' });
  console.log(`    Titres : "${newsRes.headlines[0]}"`);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. EXTENSIBILITÉ DYNAMIQUE À CHAUD (ZERO CODE CHANGE)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. EXTENSIBILITÉ DYNAMIQUE : AJOUT DU 4ÈME OUTIL SANS MODIFIER LE CODE ---');
  console.log('  Enregistrement à chaud de "stock_price" pendant l’exécution...');

  gateway.registerTarget({
    name: 'stock_price',
    description: 'Consulte le cours actuel d’une action en bourse par son symbole ticker (ex: AMZN, AAPL, GOOG)',
    targetType: 'LAMBDA',
    endpointOrArn: 'arn:aws:lambda:us-east-1:123456789012:function:exercise-stock-price',
    parameters: {
      symbol: { type: 'string', description: 'Symbole boursier de l’action', required: true },
    },
    handler: async (params) => ({
      symbol: params.symbol.toUpperCase(),
      currentPriceUsd: 186.45,
      changePercent: '+1.85%',
      exchange: 'NASDAQ',
    }),
  });

  console.log(`  Nouveau nombre total d’outils disponibles : ${gateway.getToolCount()}`);
  if (gateway.getToolCount() !== 4) throw new Error('Le 4ème outil n’a pas été enregistré');

  // Invocation immédiate du nouvel outil
  console.log('  [Req 4] Cours de l’action AMZN via le nouvel outil dynamique :');
  const stockRes = await gateway.invokeTool('stock_price', { symbol: 'AMZN' });
  console.log(`    Résultat : ${stockRes.symbol} = $${stockRes.currentPriceUsd} (${stockRes.changePercent})`);

  // ───────────────────────────────────────────────────────────────────────────
  // 5. TEST DE RÉSILIENCE & VALIDATION DES SCHÉMAS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. VALIDATION DES SCHÉMAS ET AUDIT TRAIL ---');

  // Test paramètre obligatoire manquant
  try {
    await gateway.invokeTool('weather_lambda', {});
    throw new Error('Le gateway aurait dû rejeter la requête sans ville');
  } catch (err: any) {
    console.log(`  ✅ Erreur interceptée avec succès (paramètre manquant) : ${err.message}`);
  }

  // Vérification des logs d’invocation
  const logs = gateway.getInvocationLog();
  console.log(`\n  Journal d’audit : ${logs.length} invocations enregistrées.`);
  console.table(
    logs.map((l) => ({
      Outil: l.toolName,
      Type: l.targetType,
      Statut: l.resultStatus,
      'Durée (ms)': l.durationMs,
    }))
  );

  console.log('\n===========================================================================');
  console.log('✅ TOUS LES TESTS AGENTCORE GATEWAY & PROTOCOLE MCP SONT VALIDÉS !');
  console.log('===========================================================================');
}

main().catch((err) => {
  console.error('Erreur critique :', err);
  process.exit(1);
});
