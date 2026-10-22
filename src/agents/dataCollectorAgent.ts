import { BedrockAgentCaller } from './baseBedrockClient.js';
import { fetchSupportContextTool } from '../tools/index.js';
import { CustomerProfile, RideTelemetry, MomoTransaction } from '../types/index.js';

export interface CollectorAgentOutput {
  customer?: CustomerProfile;
  ride?: RideTelemetry;
  momoTransaction?: MomoTransaction;
}

export class DataCollectorAgent {
  private caller: BedrockAgentCaller;
  private systemPrompt = `Tu es le Data Collector Agent du support client de Gozem (Super-App Afrique de l'Ouest).
Ton rôle est d'interroger la base de données interne pour récupérer le contexte complet d'un ticket :
1. Le profil et le solde portefeuille du client
2. Les données télémétriques de la course (si rideId fourni)
3. La transaction Mobile Money TMoney/Moov/MTN (si txId fourni)
Retourne un objet JSON structuré contenant les champs trouvés.`;

  constructor() {
    this.caller = new BedrockAgentCaller();
  }

  async run(params: {
    customerId: string;
    rideId?: string;
    txId?: string;
  }): Promise<CollectorAgentOutput> {
    const userPrompt = `Récupère les informations pour customerId="${params.customerId}", rideId="${params.rideId || ''}", txId="${params.txId || ''}".`;

    return await this.caller.runWithRetry<CollectorAgentOutput>(
      'DataCollectorAgent',
      this.systemPrompt,
      userPrompt,
      async () => {
        // Exécution de l'outil fetchSupportContextTool
        return await fetchSupportContextTool(params);
      }
    );
  }
}
