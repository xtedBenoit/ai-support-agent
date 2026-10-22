import { BedrockAgentCaller } from './baseBedrockClient.js';
import { evaluateGozemPoliciesTool } from '../tools/index.js';
import { DiagnosticsOutput, CustomerProfile, RideTelemetry, MomoTransaction } from '../types/index.js';

export class DiagnosticsAgent {
  private caller: BedrockAgentCaller;
  private systemPrompt = `Tu es le Diagnostics Agent de Gozem.
Ton rôle est d'analyser la réclamation d'un passager ou utilisateur Gozem en appliquant scrupuleusement les règles de politiques Gozem :
- Détour excessif (>30% distance estimée et surcoût > 200 FCFA) : éligible au remboursement du différentiel.
- Annulation par le chauffeur : les frais d'annulation débités au client doivent être annulés et remboursés.
- Recharge Mobile Money réussie côté opérateur mais absente du solde Gozem : éligible au crédit immédiat.
- Variation normale de tarif (<=200 FCFA pour trafic ou temps d'attente raisonnable) : réclamation rejetée avec explication.
Retourne obligatoirement un JSON avec les clés : ticketId, category, isEligibleForRemediation, refundAmountFcfa, confidence, explanation, rulesTriggered.`;

  constructor() {
    this.caller = new BedrockAgentCaller();
  }

  async run(params: {
    ticketId: string;
    complaintText: string;
    context: {
      customer?: CustomerProfile;
      ride?: RideTelemetry;
      momoTransaction?: MomoTransaction;
    };
  }): Promise<DiagnosticsOutput> {
    const userPrompt = `Analyse cette réclamation client :
Plainte : "${params.complaintText}"
Contexte Télémétrique : ${JSON.stringify(params.context, null, 2)}`;

    return await this.caller.runWithRetry<DiagnosticsOutput>(
      'DiagnosticsAgent',
      this.systemPrompt,
      userPrompt,
      async () => {
        const result = await evaluateGozemPoliciesTool({
          complaintText: params.complaintText,
          context: params.context,
        });
        return {
          ...result,
          ticketId: params.ticketId,
        };
      }
    );
  }
}
