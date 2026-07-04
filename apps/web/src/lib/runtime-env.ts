import { assertProductionRuntimeEnv } from '@ants/shared';

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export function assertWebRuntimeEnv(): void {
  if (isNextProductionBuild()) return;
  assertProductionRuntimeEnv(process.env, {
    service: 'web',
    allowLocalhostUrls: process.env.ALLOW_LOCALHOST_RUNTIME_URLS === '1',
  });
}
