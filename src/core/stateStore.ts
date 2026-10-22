import { withRetry } from './resilience.js';

export interface VersionedRecord {
  id: string;
  version: number;
  ttlEpochSeconds: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export class VersionConflictError extends Error {
  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(`[VersionConflictError] Conflit sur '${id}'. Version attendue: ${expectedVersion}, Version actuelle: ${actualVersion}`);
    this.name = 'VersionConflictError';
  }
}

/**
 * 🧱 Brique d'État Partagé avec Verrouillage Optimiste (Optimistic Locking)
 * Permet à N agents d'écrire en concurrence sur la même ressource sans perte de données.
 */
export class SharedStateStore<T extends VersionedRecord> {
  private store: Map<string, T> = new Map();
  private writeLog: Array<{ op: string; id: string; version: string; timestamp: number }> = [];

  /**
   * Crée un état initial en Version 0 avec TTL.
   */
  async create(record: Omit<T, 'version' | 'createdAt' | 'updatedAt' | 'ttlEpochSeconds'> & { ttlSeconds?: number }): Promise<T> {
    const now = new Date();
    const ttlSeconds = record.ttlSeconds ?? 7200; // 2 heures par défaut
    const ttlEpochSeconds = Math.floor(now.getTime() / 1000) + ttlSeconds;

    const fullRecord = {
      ...record,
      version: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ttlEpochSeconds,
    } as unknown as T;

    this.store.set(fullRecord.id, { ...fullRecord });
    this.writeLog.push({ op: 'CREATE', id: fullRecord.id, version: '0', timestamp: Date.now() });
    return { ...fullRecord };
  }

  /**
   * Lecture de l'état actuel.
   */
  async get(id: string): Promise<T | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  /**
   * LE PATTERN CLÉ : Écriture concurrente avec vérification de version et retry.
   * Reproduit exactement le ConditionExpression="version = :expected_version" de DynamoDB.
   */
  async update(id: string, updates: Partial<T>, maxRetries = 3): Promise<T> {
    return await withRetry(
      async (attempt) => {
        // 1. READ : Récupère la version actuelle servant de jeton de verrou
        const current = this.store.get(id);
        if (!current) {
          throw new Error(`Ressource '${id}' introuvable dans le SharedStateStore.`);
        }
        const expectedVersion = current.version;

        // 2. MODIFY : Prépare la nouvelle version en mémoire
        const nextVersion = expectedVersion + 1;
        const updatedRecord: T = {
          ...current,
          ...updates,
          version: nextVersion,
          updatedAt: new Date().toISOString(),
        };

        // 3. WRITE ATOMIQUE AVEC CONDITION
        // Simulation de la vérification atomique de DynamoDB
        const liveRecord = this.store.get(id);
        if (!liveRecord || liveRecord.version !== expectedVersion) {
          this.writeLog.push({
            op: 'CONFLICT',
            id,
            version: `Attendu: ${expectedVersion}, Actuel: ${liveRecord?.version}`,
            timestamp: Date.now(),
          });
          throw new VersionConflictError(id, expectedVersion, liveRecord?.version ?? -1);
        }

        // Écriture validée
        this.store.set(id, { ...updatedRecord });
        this.writeLog.push({
          op: 'UPDATE_SUCCESS',
          id,
          version: `${expectedVersion} → ${nextVersion}`,
          timestamp: Date.now(),
        });

        return { ...updatedRecord };
      },
      {
        maxRetries,
        baseDelayMs: 100, // Délais courts pour la résolution des conflits
        label: `OptimisticUpdate(${id})`,
      }
    );
  }

  /**
   * PATTERN DE COMPENSATION (State Recovery / Rollback)
   * Nettoie les états partiels si une étape bloquante échoue.
   */
  async recover(id: string, compensationUpdates: Partial<T>): Promise<T> {
    return await this.update(id, {
      ...compensationUpdates,
      status: 'CANCELLED_RECOVERED',
    });
  }

  getWriteLog() {
    return [...this.writeLog];
  }
}

/**
 * 🧠 Brique de Mémoire Conversationnelle Inter-Sessions (AgentCore Memory)
 * Mémorise les préférences durables des clients d'une commande à l'autre.
 */
export class CrossSessionMemoryStore {
  private customerProfiles: Map<string, Record<string, any>> = new Map();

  get(customerId: string): Record<string, any> {
    return { ...(this.customerProfiles.get(customerId) || {}) };
  }

  set(customerId: string, preferences: Record<string, any>): void {
    const existing = this.customerProfiles.get(customerId) || {};
    this.customerProfiles.set(customerId, {
      ...existing,
      ...preferences,
      lastUpdated: new Date().toISOString(),
    });
  }
}
