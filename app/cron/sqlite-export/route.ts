import { getEventsClient } from '@/lib/database';
import { buildCommunityDBs } from '@/lib/sqlite/builder';
import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';

/**
 * CRON job endpoint for generating SQLite databases for all communities
 * Schedule: Every hour at 5 minutes past (production) or twice daily at 6 AM/PM (dev/staging)
 *
 * This endpoint:
 * 1. Checks if data has changed in the last 1.1 hours
 * 2. If changes exist, generates SQLite databases for all communities
 * 3. Uploads compressed databases to S3
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Verify CRON authentication
    const authHeader = request.headers.get('authorization');

    // Check multiple auth methods
    const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const isCustomToken = authHeader === `Bearer ${process.env.AUTH_SECRET}`;
    const isGitHubAction = request.headers.get('x-github-actions') === 'true';
    const isDevelopment = process.env.STAGE_NAME === 'dev';

    if (!isVercelCron && !isCustomToken && !isGitHubAction && !isDevelopment) {
      console.log(`[SQLite Export CRON ${requestId}] Unauthorized request`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[SQLite Export CRON ${requestId}] Starting SQLite export job`);

    // Skip execution in production environment
    if (process.env.STAGE_NAME === 'production') {
      console.log(`[SQLite Export CRON ${requestId}] Skipping execution in production environment`);
      return NextResponse.json({
        success: true,
        message: 'Skipped SQLite export in production environment',
        requestId,
        skipped: true,
      });
    }

    // Parse request body for force parameter
    const body = await request.json().catch(() => null);
    const force = body?.force === true;

    console.log(`[SQLite Export CRON ${requestId}] Force parameter: ${force}`);

    // Check if data has changed in the last 1.1 hours (unless forced)
    let hasChanges = true;
    if (!force) {
      hasChanges = await checkForRecentChanges();

      if (!hasChanges) {
        console.log(`[SQLite Export CRON ${requestId}] No recent changes detected, skipping export`);
        return NextResponse.json({
          success: true,
          message: 'No recent changes detected, skipping SQLite export',
          requestId,
          duration: Date.now() - startTime,
        });
      }
    }

    // Process SQLite export asynchronously
    waitUntil(
      processSQLiteExport(requestId, force)
        .then(() => {
          console.log(`[SQLite Export CRON ${requestId}] Completed successfully`);
        })
        .catch((error) => {
          console.error(`[SQLite Export CRON ${requestId}] Failed:`, error);
        })
    );

    return NextResponse.json({
      success: true,
      message: 'SQLite export job started',
      requestId,
      hasChanges,
      force,
    });
  } catch (error) {
    console.error(`[SQLite Export CRON ${requestId}] Error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to start SQLite export job',
        requestId,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Check if any relevant data has changed in the last 1.1 hours
 */
async function checkForRecentChanges(): Promise<boolean> {
  let client;

  try {
    client = await getEventsClient();

    const query = `
      SELECT COUNT(*) as count
      FROM hasura_events
      WHERE created_at > NOW() - INTERVAL '1.1 hours'
        AND table_name IN (
          'areas', 'trails', 'pois', 'outings',
          'area_images', 'trail_images', 'poi_images', 'outing_images',
          'area_stewardships', 'trail_stewardships', 'poi_stewardships', 'outing_stewardships',
          'area_super_categories', 'trail_super_categories', 'poi_super_categories',
          'area_tags', 'trail_tags', 'poi_tags',
          'organizations', 'events', 'challenges', 'articles'
        )
    `;

    const result = await client.query(query);
    const count = parseInt(result.rows[0]?.count || '0');

    return count > 0;
  } catch (error) {
    console.error('[SQLite Export CRON] Error checking for changes:', error);
    // If we can't check, assume there are changes to be safe
    return true;
  } finally {
    if (client) {
      client.end();
    }
  }
}

/**
 * Process SQLite export for all communities
 */
async function processSQLiteExport(requestId: string, force = false): Promise<void> {
  const startTime = Date.now();

  try {
    console.log(`[SQLite Export ${requestId}] Starting generation for all communities (force: ${force})`);

    // Generate SQLite databases for all communities
    await buildCommunityDBs(force);

    const duration = Date.now() - startTime;
    console.log(`[SQLite Export ${requestId}] Completed in ${duration}ms`);
  } catch (error) {
    console.error(`[SQLite Export ${requestId}] Failed:`, error);
    throw error;
  }
}

// Also support GET for manual testing in development
export async function GET(request: NextRequest) {
  return POST(request);
}
