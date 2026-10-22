import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  MODEL_ID: process.env.MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MOCK_BEDROCK: process.env.MOCK_BEDROCK === 'true',
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: process.env.HOST || '0.0.0.0',
};
