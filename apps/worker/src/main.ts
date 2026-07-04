import { Worker } from 'bullmq';
import { redactLogValue } from './logging.js';
import { connection, QUEUES } from './queues.js';

// Worker de exemplo (notificações). Os processadores reais de cada fila
// (relatórios, salários, documentos, importações, backups) são adicionados
// nas fases correspondentes.
const notificationsWorker = new Worker(
  QUEUES.notifications,
  async (job) => {
    console.log(`[notifications] a processar job ${job.id}`, redactLogValue(job.data));
    return { processedAt: new Date().toISOString() };
  },
  { connection },
);

notificationsWorker.on('completed', (job) => {
  console.log(`[notifications] job ${job.id} concluído`);
});

notificationsWorker.on('failed', (job, err) => {
  console.error(`[notifications] job ${job?.id} falhou:`, err.message);
});

console.log('ANTS ERP worker iniciado. Filas:', Object.values(QUEUES).join(', '));

async function shutdown() {
  await notificationsWorker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
