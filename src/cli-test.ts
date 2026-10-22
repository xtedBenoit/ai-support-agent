import { GozemSupportCoordinator } from './coordinator/supportCoordinator.js';
import { SupportTicketInput } from './types/index.js';

async function main() {
  console.log('═'.repeat(70));
  console.log('  Support Client Gozem — Système Multi-Agents');
  console.log('  Architecture 4 Agents : DataCollector → Diagnostics → Verification → Resolution');
  console.log('═'.repeat(70));

  const testScenarios: { desc: string; expected: string; ticket: SupportTicketInput }[] = [
    {
      desc: '1. Zem à Lomé avec détour anormal (+100% distance)',
      expected: 'Vérification APPROUVÉE -> Remboursement auto de 800 FCFA',
      ticket: {
        ticketId: 'TCK-LOME-001',
        customerId: 'CUST-001',
        rideId: 'RIDE-LOME-001',
        complaintText: 'Le chauffeur Zem a fait un grand détour vers Déckon et m\'a pris 1600 FCFA au lieu de 800 FCFA !',
      },
    },
    {
      desc: '2. Taxi à Cotonou annulé par le chauffeur avec frais indus',
      expected: 'Vérification APPROUVÉE -> Annulation auto des 400 FCFA de frais',
      ticket: {
        ticketId: 'TCK-COT-002',
        customerId: 'CUST-002',
        rideId: 'RIDE-COT-002',
        complaintText: 'Le taxi a annulé lui-même à Cadjehoun mais vous avez débité 400 FCFA sur mon compte.',
      },
    },
    {
      desc: '3. Dépôt Mobile Money (TMoney) débité chez l\'opérateur mais non crédité',
      expected: 'Vérification APPROUVÉE -> Crédit manuel immédiat de 5000 FCFA',
      ticket: {
        ticketId: 'TCK-MOMO-003',
        customerId: 'CUST-003',
        txId: 'TX-TMONEY-303',
        complaintText: 'J\'ai rechargé 5000 FCFA par TMoney, j\'ai reçu le SMS de débit mais mon compte Gozem reste à zéro.',
      },
    },
    {
      desc: '4. Course Zem avec variation tarifaire normale due à la circulation',
      expected: 'Conforme -> Explication sans remboursement',
      ticket: {
        ticketId: 'TCK-LOME-004',
        customerId: 'CUST-001',
        rideId: 'RIDE-LOME-004',
        complaintText: 'Pourquoi m\'avoir facturé 1050 FCFA alors que l\'estimation était de 1000 FCFA ?',
      },
    },
    {
      desc: '5. Litige > Plafond auto (5500 FCFA > 3000 FCFA)',
      expected: 'Vérification BLOQUÉE (Plafond) -> Escalade Superviseur requise',
      ticket: {
        ticketId: 'TCK-HIGH-005',
        customerId: 'CUST-005-VIP',
        rideId: 'RIDE-LOME-005-HIGH',
        complaintText: 'Le taxi a fait un détour colossal sur la route de Kpalimé, surfacturation de 5500 FCFA !',
      },
    },
    {
      desc: '6. Client récidiviste sous surveillance abus (4 remboursements récents)',
      expected: 'Vérification BLOQUÉE (Risque Fraude) -> Escalade Cellule Fraude',
      ticket: {
        ticketId: 'TCK-FRAUD-006',
        customerId: 'CUST-004-ABUSE',
        rideId: 'RIDE-LOME-006-FRAUD',
        complaintText: 'Je veux être remboursé pour ce détour de 600 FCFA immédiatement !',
      },
    },
  ];

  const coordinator = new GozemSupportCoordinator();

  for (const s of testScenarios) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  Scénario : ${s.desc}`);
    console.log(`  Attendu  : ${s.expected}`);
    console.log(`${'─'.repeat(70)}`);

    const result = await coordinator.resolveTicket(s.ticket);

    console.log(`\n  Synthèse finale :`);
    console.log(`    Client          : ${result.collectedContext.customer?.name} (${result.collectedContext.customer?.phone})`);
    console.log(`    Diagnostic      : ${result.diagnostics.category}`);
    console.log(`    Vérification    : ${result.verification.status} [Risque: ${result.verification.riskLevel}]`);
    console.log(`    Superviseur req : ${result.verification.requiresSupervisorApproval ? 'OUI' : 'NON'}`);
    console.log(`    Action prise    : ${result.resolution.actionTaken}`);
    console.log(`    Message client  : ${result.resolution.customerMessage}`);
    console.log(`    Trace d'audit   : ${result.resolution.auditTrail}`);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('  Tous les scénarios de test (avec Agent de Vérification) ont été exécutés !');
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('Erreur lors de l\'exécution du CLI test :', err);
});
