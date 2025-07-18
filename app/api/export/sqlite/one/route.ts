import { requireAdminAuth } from '@/lib/auth';
import { buildCommunityDB } from '@/lib/sqlite/builder';
import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Check admin authentication
  const authError = requireAdminAuth(request);
  if (authError) {
    return authError;
  }

  try {

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Community ID is required' }, { status: 400 });
    }

    const communityId = parseInt(body.id);
    if (isNaN(communityId)) {
      return NextResponse.json({ error: 'Invalid community ID' }, { status: 400 });
    }

    // Start the async processing
    waitUntil(processCommunity(communityId));

    return NextResponse.json({
      success: true,
      communityId: communityId,
      message: `SQLite database generation queued for community ${communityId}`,
    });
  } catch (error) {
    console.error('Error queuing community SQLite database:', error);
    return NextResponse.json(
      {
        error: 'Failed to queue SQLite database generation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function processCommunity(communityId: number) {
  try {
    console.log(`[SQLite Export] Starting generation for community ${communityId}`);
    await buildCommunityDB(communityId);
    console.log(`[SQLite Export] Completed generation for community ${communityId}`);
  } catch (error) {
    console.error(`[SQLite Export] Error generating for community ${communityId}:`, error);
  }
}
