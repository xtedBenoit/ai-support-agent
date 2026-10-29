/**
 * AgentCore Tool Gateway & MCP Protocol Integration
 * (Inspiré de Analytics Gateway - Module 11)
 *
 * Ce module implémente le patron de Gateway universel pour découpler les agents des outils :
 * 1. Cycle de vie : Registration → Semantic Discovery → Invocation
 * 2. Support multi-cibles : AWS Lambda, API REST, Microservices, Handlers locaux
 * 3. Protocole MCP (Model Context Protocol) et schémas JSON Schema
 * 4. Extensibilité dynamique à chaud (Zero Code Change) : ajout d'outils sans redéployer l'agent
 * 5. Journalisation complète des invocations (Audit Trail)
 */

export type GatewayTargetType = 'LAMBDA' | 'REST_API' | 'LOCAL_HANDLER';

export interface ToolInputProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

export interface GatewayTargetSpec {
  name: string;
  description: string;
  targetType: GatewayTargetType;
  endpointOrArn?: string;
  parameters: Record<string, ToolInputProperty>;
  handler?: (params: Record<string, any>) => Promise<any> | any;
}

export interface DiscoveredTool {
  name: string;
  description: string;
  type: GatewayTargetType;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolInputProperty>;
    required: string[];
  };
}

export interface ToolInvocationRecord {
  gatewayId: string;
  toolName: string;
  targetType: GatewayTargetType;
  endpointOrArn?: string;
  params: Record<string, any>;
  resultStatus: 'SUCCESS' | 'ERROR';
  durationMs: number;
  timestamp: string;
  response: any;
}

export class AgentCoreGateway {
  public readonly gatewayId: string;
  public readonly name: string;
  public readonly description: string;
  private targets: Map<string, GatewayTargetSpec> = new Map();
  private invocationLog: ToolInvocationRecord[] = [];

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
    this.gatewayId = `GW-${name.toUpperCase().replace(/\s+/g, '-').slice(0, 20)}`;
  }

  /**
   * Enregistre un outil / microservice comme cible de la passerelle.
   */
  registerTarget(target: GatewayTargetSpec): void {
    this.targets.set(target.name, target);
  }

  /**
   * Supprime un outil de la passerelle à chaud.
   */
  unregisterTarget(name: string): boolean {
    return this.targets.delete(name);
  }

  /**
   * Découverte sémantique des outils disponibles.
   * Si une requête est fournie, filtre les outils selon la pertinence des mots-clés.
   */
  discoverTools(query?: string): DiscoveredTool[] {
    const list: DiscoveredTool[] = [];
    const q = query?.toLowerCase().trim();

    for (const target of this.targets.values()) {
      if (!q || target.name.toLowerCase().includes(q) || target.description.toLowerCase().includes(q)) {
        const requiredFields = Object.entries(target.parameters)
          .filter(([_, prop]) => prop.required)
          .map(([key]) => key);

        list.push({
          name: target.name,
          description: target.description,
          type: target.targetType,
          inputSchema: {
            type: 'object',
            properties: target.parameters,
            required: requiredFields,
          },
        });
      }
    }

    return list;
  }

  /**
   * Génère la documentation MCP des outils pour injection automatique dans le prompt système du LLM.
   */
  formatSystemPromptCatalog(): string {
    const tools = this.discoverTools();
    if (tools.length === 0) return 'Aucun outil disponible.';

    return tools
      .map((t) => {
        const paramsDesc = Object.entries(t.inputSchema.properties)
          .map(([k, v]) => `    * ${k} (${v.type}${v.required ? ', obligatoire' : ''}): ${v.description}`)
          .join('\n');
        return `- Outil: ${t.name} [Type: ${t.type}]\n  Description: ${t.description}\n  Paramètres:\n${paramsDesc}`;
      })
      .join('\n\n');
  }

  /**
   * Invoque un outil via la passerelle de manière découplée avec journalisation et contrôle des types.
   */
  async invokeTool(toolName: string, params: Record<string, any>): Promise<any> {
    const startTime = Date.now();
    const target = this.targets.get(toolName);

    if (!target) {
      const errRecord: ToolInvocationRecord = {
        gatewayId: this.gatewayId,
        toolName,
        targetType: 'LOCAL_HANDLER',
        params,
        resultStatus: 'ERROR',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        response: { error: `Outil '${toolName}' introuvable dans la passerelle ${this.gatewayId}` },
      };
      this.invocationLog.push(errRecord);
      throw new Error(errRecord.response.error);
    }

    // Validation basique des paramètres obligatoires
    for (const [key, prop] of Object.entries(target.parameters)) {
      if (prop.required && (params[key] === undefined || params[key] === null)) {
        const missingErr = `Paramètre obligatoire manquant : '${key}' pour l'outil '${toolName}'`;
        this.invocationLog.push({
          gatewayId: this.gatewayId,
          toolName,
          targetType: target.targetType,
          endpointOrArn: target.endpointOrArn,
          params,
          resultStatus: 'ERROR',
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          response: { error: missingErr },
        });
        throw new Error(missingErr);
      }
    }

    try {
      let result: any;
      if (target.handler) {
        result = await target.handler(params);
      } else {
        // Simulation d'invocation Lambda / REST distante
        result = {
          simulated: true,
          endpoint: target.endpointOrArn,
          status: 'SUCCESS',
          payload: params,
        };
      }

      const durationMs = Date.now() - startTime;
      this.invocationLog.push({
        gatewayId: this.gatewayId,
        toolName,
        targetType: target.targetType,
        endpointOrArn: target.endpointOrArn,
        params,
        resultStatus: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
        response: result,
      });

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.invocationLog.push({
        gatewayId: this.gatewayId,
        toolName,
        targetType: target.targetType,
        endpointOrArn: target.endpointOrArn,
        params,
        resultStatus: 'ERROR',
        durationMs,
        timestamp: new Date().toISOString(),
        response: { error: err.message },
      });
      throw err;
    }
  }

  /**
   * Retourne l'historique complet d'audit des appels passés par la passerelle.
   */
  getInvocationLog(): ToolInvocationRecord[] {
    return [...this.invocationLog];
  }

  /**
   * Nombre d'outils actuellement enregistrés.
   */
  getToolCount(): number {
    return this.targets.size;
  }
}
