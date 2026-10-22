import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { GozemSupportCoordinator } from '../coordinator/supportCoordinator.js';
import { SupportTicketSchema } from '../types/index.js';

export const supportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const coordinator = new GozemSupportCoordinator();

  // Healthcheck
  fastify.get('/health', async () => {
    return {
      status: 'UP',
      service: 'Gozem Multi-Agent AI Support System',
      agents: ['DataCollectorAgent', 'DiagnosticsAgent', 'VerificationAgent', 'ResolutionAgent'],
      timestamp: new Date().toISOString(),
    };
  });

  // Liste des scénarios types Gozem prêts à être testés
  fastify.get('/sample-scenarios', async () => {
    return {
      scenarios: [
        {
          id: 'SCENARIO-1',
          name: 'Surfacturation suite à un détour en Zem à Lomé (Auto-approuvé)',
          payload: {
            ticketId: 'TCK-LOME-001',
            customerId: 'CUST-001',
            rideId: 'RIDE-LOME-001',
            complaintText: 'Le chauffeur Zem a fait un grand détour vers Déckon et m\'a pris 1600 FCFA au lieu de 800 FCFA !',
          },
        },
        {
          id: 'SCENARIO-2',
          name: 'Frais d\'annulation indus prélevés à Cotonou (Auto-approuvé)',
          payload: {
            ticketId: 'TCK-COT-002',
            customerId: 'CUST-002',
            rideId: 'RIDE-COT-002',
            complaintText: 'Le taxi a annulé lui-même à Cadjehoun mais vous avez prélevé 400 FCFA de pénalité sur mon compte.',
          },
        },
        {
          id: 'SCENARIO-3',
          name: 'Recharge TMoney réussie mais solde Gozem non crédité (Auto-approuvé)',
          payload: {
            ticketId: 'TCK-MOMO-003',
            customerId: 'CUST-003',
            txId: 'TX-TMONEY-303',
            complaintText: 'J\'ai rechargé 5000 FCFA par TMoney, j\'ai reçu le SMS de débit mais mon compte Gozem reste à zéro.',
          },
        },
        {
          id: 'SCENARIO-4',
          name: 'Course normale avec légère variation tarifaire justifiée',
          payload: {
            ticketId: 'TCK-LOME-004',
            customerId: 'CUST-001',
            rideId: 'RIDE-LOME-004',
            complaintText: 'Pourquoi m\'avoir facturé 1050 FCFA alors que l\'estimation était de 1000 FCFA ?',
          },
        },
        {
          id: 'SCENARIO-5',
          name: 'Litige supérieur au plafond automatique (5500 FCFA > 3000 FCFA -> Bloqué par l\'Agent de Vérification)',
          payload: {
            ticketId: 'TCK-HIGH-005',
            customerId: 'CUST-005-VIP',
            rideId: 'RIDE-LOME-005-HIGH',
            complaintText: 'Le taxi a fait un détour colossal sur la route de Kpalimé, surfacturation de plus de 5000 FCFA !',
          },
        },
        {
          id: 'SCENARIO-6',
          name: 'Client récidiviste sous surveillance abus (Bloqué par l\'Agent de Vérification)',
          payload: {
            ticketId: 'TCK-FRAUD-006',
            customerId: 'CUST-004-ABUSE',
            rideId: 'RIDE-LOME-006-FRAUD',
            complaintText: 'Je veux être remboursé pour ce détour de 600 FCFA immédiatement !',
          },
        },
      ],
    };
  });

  // Résolution d'un ticket de support via le pipeline multi-agents
  fastify.post('/resolve-ticket', async (request, reply) => {
    const parseResult = SupportTicketSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation des données d\'entrée échouée',
        details: parseResult.error.format(),
      });
    }

    try {
      const ticket = parseResult.data;
      const report = await coordinator.resolveTicket(ticket);
      return reply.status(200).send({
        success: true,
        data: report,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors du traitement par le coordinateur multi-agents',
        message: error.message,
      });
    }
  });
};
