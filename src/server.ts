import Fastify from 'fastify';
import { CONFIG } from './config/env.js';
import { supportRoutes } from './routes/supportRoutes.js';

const app = Fastify({
  logger: {
    level: 'info',
  },
});

// Enregistrement des routes avec préfixe API
app.register(supportRoutes, { prefix: '/api/v1/support' });

const start = async () => {
  try {
    await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
    console.log(`
  ════════════════════════════════════════════════════════════════
    GOZEM MULTI-AGENT CUSTOMER SUPPORT API
  ════════════════════════════════════════════════════════════════
    Mode LLM       : ${CONFIG.MOCK_BEDROCK ? 'SIMULATION / MOCK (Local test sans AWS)' : 'AWS Bedrock (' + CONFIG.MODEL_ID + ')'}
    Région AWS     : ${CONFIG.AWS_REGION}
    Serveur démarré: http://localhost:${CONFIG.PORT}
    Healthcheck    : http://localhost:${CONFIG.PORT}/api/v1/support/health
    Scénarios test : http://localhost:${CONFIG.PORT}/api/v1/support/sample-scenarios
    Résolution     : POST http://localhost:${CONFIG.PORT}/api/v1/support/resolve-ticket
  ════════════════════════════════════════════════════════════════
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
