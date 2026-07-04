import { NextResponse } from 'next/server';
import { assertWebRuntimeEnv } from '@/lib/runtime-env';

export const dynamic = 'force-dynamic';

export function GET() {
  assertWebRuntimeEnv();
  return NextResponse.json(
    {
      status: 'ok',
      service: 'ants-erp-web',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
