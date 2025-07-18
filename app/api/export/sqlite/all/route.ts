import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { buildCommunityDBs } from '@/lib/sqlite/builder';
import { requireAdminAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Check admin authentication
  const authError = requireAdminAuth(request);
  if (authError) {
    return authError;
  }

  try {

    // Parse request body for force parameter
    const body = await request.json().catch(() => null);
    const force = body?.force === true;

    console.log(`[SQLite Export All] Force parameter: ${force}`);

    // Start the async processing
    waitUntil(processAllCommunities(force));

    return NextResponse.json({
      status: 'Queued',
      message: 'SQLite database generation for all communities has been queued',
      force,
    });
  } catch (error) {
    console.error('Error queuing SQLite database generation:', error);
    return NextResponse.json(
      {
        error: 'Failed to queue SQLite database generation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function processAllCommunities(force = false) {
  try {
    console.log(`[SQLite Export] Starting generation for all communities (force: ${force})`);
    const result = await buildCommunityDBs(force);

    if (result === false) {
      console.log('[SQLite Export] No changes detected, skipping generation');
      return;
    }

    console.log('[SQLite Export] Completed generation for all communities');
  } catch (error) {
    console.error('[SQLite Export] Error during generation:', error);
  }
}
