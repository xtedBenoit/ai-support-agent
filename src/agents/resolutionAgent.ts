import { BedrockAgentCaller } from './baseBedrockClient.js';
import { executeGozemActionTool } from '../tools/index.js';
import { CommandActionOutput, DiagnosticsOutput, VerificationOutput } from '../types/index.js';

export class ResolutionAgent {
  private caller: BedrockAgentCaller;
  private systemPrompt = `Tu es le Resolution Agent (Command Agent) de Gozem.
Ton rôle est d'exécuter la remédiation validée par l'Agent de Vérification :
1. Si l'Agent de Vérification a bloqué l'action (seuil élevé ou risque fraude), escalade vers le bon département sans effectuer de débit.
2. Si l'action est autorisée, déclenche le crédit portefeuille ou l'annulation des frais.
3. Formule un message chaleureux, poli et empathique destiné au client en français.
4. Consigne une trace d'audit détaillée pour le département financier et support.
Retourne obligatoirement un JSON avec actionId, actionTaken, amountFcfa, currency, customerMessage, auditTrail.`;

  constructor() {
    this.caller = new BedrockAgentCaller();
  }

  async run(params: {
    customerId: string;
    diagnostics: DiagnosticsOutput;
    verification: VerificationOutput;
  }): Promise<CommandActionOutput> {
    const userPrompt = `Exécute l'action de remédiation pour customerId="${params.customerId}" selon :
Diagnostic : ${JSON.stringify(params.diagnostics, null, 2)}
Vérification & Sécurité : ${JSON.stringify(params.verification, null, 2)}`;

    return await this.caller.runWithRetry<CommandActionOutput>(
      'ResolutionAgent',
      this.systemPrompt,
      userPrompt,
      async () => {
        return await executeGozemActionTool({
          customerId: params.customerId,
          diagnostics: params.diagnostics,
          verification: params.verification,
        });
      }
    );
  }
}
