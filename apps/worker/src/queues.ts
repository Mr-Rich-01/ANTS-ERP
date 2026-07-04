import type { ConnectionOptions } from 'bullmq';
import { assertWorkerRuntimeEnv } from './runtime-env.js';

/**
 * Opções de ligação ao Redis para o BullMQ (derivadas de REDIS_URL).
 * Deixamos o BullMQ gerir a sua própria instância ioredis para evitar
 * conflitos de tipos entre versões.
 */
function buildConnection(): ConnectionOptions {
  assertWorkerRuntimeEnv();
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export const connection: ConnectionOptions = buildConnection();

/** Nomes das filas BullMQ usadas pelo sistema. */
export const QUEUES = {
  notifications: 'notifications',
  reports: 'reports',
  payroll: 'payroll',
  documents: 'documents',
  imports: 'imports',
  backups: 'backups',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
