import {
  SharedStateStore,
  CrossSessionMemoryStore,
  VersionedRecord,
} from './index.js';

interface FoodOrderState extends VersionedRecord {
  customerId: string;
  restaurant: string;
  items: Array<{ name: string; price: number; qty: number }>;
  driver?: { id: string; name: string; vehicle: string } | null;
  totalPrice?: { subtotal: number; deliveryFee: number; total: number } | null;
  progress: string[];
}

async function main() {
  console.log('═'.repeat(75));
  console.log('  TEST DU SHARED STATE ENGINE & CROSS-SESSION MEMORY');
  console.log('  Patron DynamoDB Optimistic Locking + AgentCore Memory');
  console.log('═'.repeat(75));

  const stateStore = new SharedStateStore<FoodOrderState>();
  const memoryStore = new CrossSessionMemoryStore();

  // ──────────────────────────────────────────────────────────────────────────
  // SCÉNARIO 1 : Écritures séquentielles normales
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 SCÉNARIO 1 : Mises à jour séquentielles sans conflit');
  const order1 = await stateStore.create({
    id: 'ORD-001',
    customerId: 'CUST-42',
    restaurant: 'Tokyo Ramen House',
    items: [{ name: 'Tonkotsu Ramen', price: 16.5, qty: 1 }],
    status: 'pending',
    progress: ['Commande créée'],
    driver: null,
    totalPrice: null,
  });
  console.log(`  ✓ Créé : ${order1.id} (Version: ${order1.version}, Statut: ${order1.status})`);

  // [1/4] Restaurant confirme
  const v1 = await stateStore.update(order1.id, { status: 'confirmed' });
  console.log(`  [1/4] RestaurantConfirmAgent -> Statut: ${v1.status} (v${v1.version})`);

  // [2/4] Chauffeur affecté
  const v2 = await stateStore.update(order1.id, {
    driver: { id: 'DRV-301', name: 'Carlos Rivera', vehicle: 'Honda Civic' },
  });
  console.log(`  [2/4] DriverAssignAgent     -> Livreur: ${v2.driver?.name} (v${v2.version})`);

  // [3/4] Calcul du prix
  const v3 = await stateStore.update(order1.id, {
    totalPrice: { subtotal: 16.5, deliveryFee: 4.99, total: 21.49 },
  });
  console.log(`  [3/4] PriceCalculatorAgent  -> Total: ${v3.totalPrice?.total}$ (v${v3.version})`);

  // [4/4] Statut final
  const v4 = await stateStore.update(order1.id, { status: 'ready_for_pickup' });
  console.log(`  [4/4] StatusTrackerAgent    -> Statut final: ${v4.status} (v${v4.version})`);

  // Sauvegarde dans la mémoire de session (AgentCore Memory)
  memoryStore.set('CUST-42', {
    preferredDriver: 'DRV-301',
    favoriteRestaurant: 'Tokyo Ramen House',
    ordersCount: 1,
  });
  console.log('  🧠 Mémoire inter-session mise à jour pour CUST-42 (Livreur favori: Carlos Rivera)');

  // ──────────────────────────────────────────────────────────────────────────
  // SCÉNARIO 2 : Écritures concurrentes en parallèle (Résolution des conflits)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(75));
  console.log('📌 SCÉNARIO 2 : 3 Agents écrivent en PARALLÈLE sur le même objet');
  console.log('   (Simule des conflits de versions résolus par retry)');
  console.log('─'.repeat(75));

  const order2 = await stateStore.create({
    id: 'ORD-002',
    customerId: 'CUST-77',
    restaurant: 'Bella Italia',
    items: [{ name: 'Margherita Pizza', price: 14.0, qty: 1 }],
    status: 'pending',
    progress: [],
    driver: null,
    totalPrice: null,
  });
  console.log(`  ✓ Créé : ${order2.id} (v${order2.version})`);

  // Lancement de 3 agents simultanément avec Promise.all
  console.log('  🚀 Lancement des 3 agents en parallèle...');
  await Promise.all([
    stateStore.update(order2.id, { status: 'confirmed' }),
    stateStore.update(order2.id, { driver: { id: 'DRV-302', name: 'Maria Santos', vehicle: 'Toyota' } }),
    stateStore.update(order2.id, { totalPrice: { subtotal: 14.0, deliveryFee: 4.99, total: 18.99 } }),
  ]);

  const state2 = await stateStore.get(order2.id);
  console.log(`  ✓ État final après concurrence : ${state2?.id} v${state2?.version}`);
  console.log(`    Statut : ${state2?.status} | Livreur: ${state2?.driver?.name} | Total: ${state2?.totalPrice?.total}$`);

  // ──────────────────────────────────────────────────────────────────────────
  // SCÉNARIO 3 : Rejet et Récupération d'état (State Recovery / Rollback)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(75));
  console.log('📌 SCÉNARIO 3 : Rejet du restaurant & Récupération d\'état (Pattern Saga)');
  console.log('   Client : CUST-42 (Alice Chen - revient avec ses préférences)');
  console.log('─'.repeat(75));

  // Lecture de la mémoire inter-sessions
  const aliceMemory = memoryStore.get('CUST-42');
  console.log(`  🧠 Préférences retrouvées pour CUST-42 : Livreur préféré = ${aliceMemory.preferredDriver}`);

  const order3 = await stateStore.create({
    id: 'ORD-003',
    customerId: 'CUST-42',
    restaurant: 'Tokyo Ramen House',
    items: [{ name: 'Spicy Miso Ramen', price: 17.5, qty: 1 }],
    status: 'pending',
    progress: [],
    driver: null,
    totalPrice: null,
  });

  // Mises à jour partielles
  await stateStore.update(order3.id, {
    driver: { id: aliceMemory.preferredDriver, name: 'Carlos Rivera', vehicle: 'Honda' },
  });
  await stateStore.update(order3.id, {
    totalPrice: { subtotal: 17.5, deliveryFee: 4.99, total: 22.49 },
  });

  const stateBeforeReject = await stateStore.get(order3.id);
  console.log(`  • État avant rejet : v${stateBeforeReject?.version} (Livreur: ${stateBeforeReject?.driver?.name}, Prix: ${stateBeforeReject?.totalPrice?.total}$)`);

  // Le restaurant rejette la commande !
  console.log('  ⚠️ Le restaurant refuse la commande : "Cuisine fermée exceptionnellement"');
  console.log('  🧹 Déclenchement de la compensation (State Recovery)...');

  const recovered = await stateStore.recover(order3.id, {
    driver: null,
    totalPrice: null,
    progress: ['Commande rejetée par le restaurant', 'Données partielles nettoyées'],
  });

  console.log(`  ✓ État récupéré : ${recovered.id} v${recovered.version}`);
  console.log(`    Statut final : ${recovered.status}`);
  console.log(`    Livreur      : ${recovered.driver}`);
  console.log(`    Prix         : ${recovered.totalPrice}`);
  console.log(`    Journal      : ${recovered.progress.join(' -> ')}`);

  console.log('\n' + '═'.repeat(75));
  console.log('  🎉 Brique StateStore & Memory validée : Prête pour l\'orchestration !');
  console.log('═'.repeat(75));
}

main().catch(console.error);
