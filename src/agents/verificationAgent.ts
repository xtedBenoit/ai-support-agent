import { BedrockAgentCaller } from './baseBedrockClient.js';
import { verifyComplianceTool } from '../tools/index.js';
import {
  VerificationOutput,
  DiagnosticsOutput,
  CustomerProfile,
  RideTelemetry,
} from '../types/index.js';

export class VerificationAgent {
  private caller: BedrockAgentCaller;
  private systemPrompt = `Tu es le Verification & Compliance Agent (Guardrail Agent) de Gozem.
Ton rôle est de contrôler et sécuriser toute décision financière avant son exécution :
1. Plafond financier : Si le montant de remboursement dépasse 3 000 FCFA, l'exécution automatique doit être bloquée (BLOCKED_ABOVE_THRESHOLD) et requérir l'approbation d'un superviseur.
2. Anti-Fraude : Si le client a déjà eu 3 remboursements ou plus ce mois-ci, ou si son compte est sous surveillance, bloque l'action pour risque de fraude (BLOCKED_FRAUD_RISK).
3. Cohérence : Le montant remboursé ne peut jamais excéder le montant payé.
Retourne obligatoirement un JSON avec : verified, status, authorizedAmountFcfa, riskLevel, requiresSupervisorApproval, verificationAudit, flags.`;

  constructor() {
    this.caller = new BedrockAgentCaller();
  }

  async run(params: {
    customer?: CustomerProfile;
    ride?: RideTelemetry;
    diagnostics: DiagnosticsOutput;
  }): Promise<VerificationOutput> {
    const userPrompt = `Effectue le contrôle de conformité pour le client ${params.customer?.customerId || 'Inconnu'} :
Diagnostic proposé : ${JSON.stringify(params.diagnostics, null, 2)}
Profil client : ${JSON.stringify(params.customer || {}, null, 2)}
Course : ${JSON.stringify(params.ride || {}, null, 2)}`;

    return await this.caller.runWithRetry<VerificationOutput>(
      'VerificationAgent',
      this.systemPrompt,
      userPrompt,
      async () => {
        return await verifyComplianceTool({
          customer: params.customer,
          ride: params.ride,
          diagnostics: params.diagnostics,
        });
      }
    );
  }
}
