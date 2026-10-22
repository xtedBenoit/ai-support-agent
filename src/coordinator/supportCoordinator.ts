import { DataCollectorAgent } from '../agents/dataCollectorAgent.js';
import { DiagnosticsAgent } from '../agents/diagnosticsAgent.js';
import { VerificationAgent } from '../agents/verificationAgent.js';
import { ResolutionAgent } from '../agents/resolutionAgent.js';
import { SupportTicketInput, CoordinatorPipelineReport } from '../types/index.js';

export class GozemSupportCoordinator {
  private dataCollector: DataCollectorAgent;
  private diagnosticsAgent: DiagnosticsAgent;
  private verificationAgent: VerificationAgent;
  private resolutionAgent: ResolutionAgent;

  constructor() {
    this.dataCollector = new DataCollectorAgent();
    this.diagnosticsAgent = new DiagnosticsAgent();
    this.verificationAgent = new VerificationAgent();
    this.resolutionAgent = new ResolutionAgent();
  }

  /**
   * Pipeline séquentiel à 4 agents :
   * 1. DataCollectorAgent: collecte les données télémétriques et le profil
   * 2. DiagnosticsAgent: évalue la réclamation par rapport aux règles Gozem
   * 3. VerificationAgent: vérifie la sécurité financière, le risque de fraude et les plafonds
   * 4. ResolutionAgent: prend la décision finale et applique l'action de remédiation
   */
  async resolveTicket(ticket: SupportTicketInput): Promise<CoordinatorPipelineReport> {
    console.log(`\n  ==============================================================`);
    console.log(`  [Ticket ${ticket.ticketId}] Début du pipeline support multi-agents`);
    console.log(`  Client: ${ticket.customerId} | Course: ${ticket.rideId || 'N/A'} | MoMo: ${ticket.txId || 'N/A'}`);
    console.log(`  ==============================================================`);

    // ── ÉTAPE 1: Data Collector Agent ──
    console.log(`    [1/4] DataCollectorAgent: Recherche des données Gozem...`);
    const context = await this.dataCollector.run({
      customerId: ticket.customerId,
      rideId: ticket.rideId,
      txId: ticket.txId,
    });
    console.log(`      ✓ Données récupérées : Client "${context.customer?.name || 'Inconnu'}" (${context.customer?.city || 'Afrique'})`);
    if (context.ride) {
      console.log(`      ✓ Course ${context.ride.serviceType} : Facturé ${context.ride.chargedFareFcfa} FCFA (Estimé ${context.ride.estimatedFareFcfa} FCFA)`);
    }
    if (context.momoTransaction) {
      console.log(`      ✓ Transaction ${context.momoTransaction.provider} : ${context.momoTransaction.amountFcfa} FCFA (Opérateur: ${context.momoTransaction.operatorStatus})`);
    }

    // ── ÉTAPE 2: Diagnostics Agent ──
    console.log(`    [2/4] DiagnosticsAgent: Analyse des politiques et règles métier...`);
    const diagnostics = await this.diagnosticsAgent.run({
      ticketId: ticket.ticketId,
      complaintText: ticket.complaintText,
      context,
    });
    console.log(`      ✓ Catégorie : ${diagnostics.category}`);
    console.log(`      ✓ Éligibilité Remédiation : ${diagnostics.isEligibleForRemediation ? 'OUI' : 'NON'}`);
    if (diagnostics.isEligibleForRemediation) {
      console.log(`      ✓ Montant calculé : ${diagnostics.refundAmountFcfa} FCFA (Confiance: ${Math.round(diagnostics.confidence * 100)}%)`);
    }
    console.log(`      ✓ Explication : ${diagnostics.explanation}`);

    // ── ÉTAPE 3: Verification Agent (Audit, Sécurité & Anti-Fraude) ──
    console.log(`    [3/4] VerificationAgent: Contrôle de conformité et des plafonds...`);
    const verification = await this.verificationAgent.run({
      customer: context.customer,
      ride: context.ride,
      diagnostics,
    });
    console.log(`      ✓ Statut Vérification : ${verification.status}`);
    console.log(`      ✓ Niveau de risque : ${verification.riskLevel}`);
    console.log(`      ✓ Approbation Superviseur requise : ${verification.requiresSupervisorApproval ? 'OUI' : 'NON'}`);
    console.log(`      ✓ Montant autorisé : ${verification.authorizedAmountFcfa} FCFA`);
    console.log(`      ✓ Audit : ${verification.verificationAudit}`);

    // ── ÉTAPE 4: Resolution Agent ──
    console.log(`    [4/4] ResolutionAgent: Exécution de l'action corrective...`);
    const resolution = await this.resolutionAgent.run({
      customerId: ticket.customerId,
      diagnostics,
      verification,
    });
    console.log(`      ✓ Action effectuée : ${resolution.actionTaken}`);
    console.log(`      ✓ Notification client : "${resolution.customerMessage}"`);
    console.log(`      ✓ Audit : ${resolution.auditTrail}`);

    return {
      ticketId: ticket.ticketId,
      customerId: ticket.customerId,
      timestamp: new Date().toISOString(),
      collectedContext: context,
      diagnostics,
      verification,
      resolution,
    };
  }
}
