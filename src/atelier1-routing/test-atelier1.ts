import { RoutingCoordinator } from './routingCoordinator.js';

async function main() {
  console.log('═'.repeat(75));
  console.log('  ATELIER 1 : ROUTAGE INTELLIGENT & ARCHITECTURE MULTI-MODÈLES');
  console.log('  Course 4 — Multi-Agent Systems on AWS');
  console.log('═'.repeat(75));

  const testQueries = [
    {
      title: 'Scénario 1 : Suivi de commande avec ID explicite (Fast-path déterministe)',
      query: 'Où est mon colis ORD-7782 ? Le coursier a du retard.',
    },
    {
      title: 'Scénario 2 : Recherche de produit en langage naturel (LLM Router)',
      query: 'Je cherche un bon casque de moto homologué pour rouler en ville, quel est le prix ?',
    },
    {
      title: 'Scénario 3 : Litige de facturation et débit anormal (Routage vers Claude Sonnet)',
      query: 'On m\'a prélevé 3500 FCFA deux fois sur ma dernière course Zem, je veux mon remboursement !',
    },
    {
      title: 'Scénario 4 : Demande de suivi sans numéro de commande explicite (LLM Classifier)',
      query: 'Mon colis de ce matin n\'est toujours pas arrivé, vous pouvez vérifier le statut de livraison ?',
    },
    {
      title: 'Scénario 5 : Question générale / FAQ (Modèle économique)',
      query: 'Quels sont vos horaires de service et zones de livraison le dimanche ?',
    },
  ];

  const coordinator = new RoutingCoordinator();

  for (const scenario of testQueries) {
    console.log(`\n${'─'.repeat(75)}`);
    console.log(`  📌 ${scenario.title}`);
    console.log(`  Entrée client : "${scenario.query}"`);
    console.log(`${'─'.repeat(75)}`);

    const result = await coordinator.process(scenario.query);

    console.log(`  🔀 DÉCISION DU ROUTEUR :`);
    console.log(`     • Méthode de routage  : ${result.routingDecision.routingMethod}`);
    console.log(`     • Modèle du routeur   : ${result.routingDecision.modelUsed}`);
    console.log(`     • Agent Cible Choisi  : 👉 ${result.routingDecision.targetAgent}`);
    console.log(`     • Confiance           : ${Math.round(result.routingDecision.confidence * 100)}%`);
    console.log(`     • Justification       : ${result.routingDecision.reasoning}`);
    if (Object.keys(result.routingDecision.extractedEntities).length > 0) {
      console.log(`     • Entités extraites   : ${JSON.stringify(result.routingDecision.extractedEntities)}`);
    }

    console.log(`\n  🤖 EXÉCUTION PAR L'AGENT EXPERT :`);
    console.log(`     • Agent Exécutant     : ${result.agentResult.agentName}`);
    console.log(`     • Modèle Spécialisé   : ${result.agentResult.modelId}`);
    console.log(`     • Réponse Client      :`);
    console.log(`       "${result.agentResult.outputMessage.replace(/\n/g, '\n       ')}"`);

    console.log(`\n  ⚡ MÉTRIQUES DE PERFORMANCE :`);
    console.log(`     • Latence Routage     : ${result.executionMetrics.routingLatencyMs} ms`);
    console.log(`     • Latence Totale      : ${result.executionMetrics.totalLatencyMs} ms`);
  }

  console.log(`\n${'═'.repeat(75)}`);
  console.log('  🎉 Atelier 1 validé : Routage Hybride et Multi-Modèles opérationnels !');
  console.log('═'.repeat(75));
}

main().catch((err) => {
  console.error('Erreur durant l\'atelier 1 :', err);
});
