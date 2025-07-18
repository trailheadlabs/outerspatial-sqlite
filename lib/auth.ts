import { NextRequest, NextResponse } from 'next/server';

interface AuthResult {
  error?: string;
  authorized: boolean;
  context?: { 
    token: string;
    authorized: boolean;
  };
}

/**
 * Validate admin secret authentication
 * Checks for x-rest-auth-secret header or Authorization header with admin secret
 */
export function validateAdminAuth(request: NextRequest): AuthResult {
  // if dev environment, allow access without authentication
  if (process.env.STAGE_NAME === 'dev') {
    return { authorized: true };
  }
  const adminSecret = process.env.AUTH_SECRET;

  if (!adminSecret) {
    console.error('AUTH_SECRET environment variable not configured');
    return {
      authorized: false,
      error: 'Authentication not configured',
    };
  }

  // Check x-rest-auth-secret header (primary method)
  const restAdminSecret = request.headers.get('x-rest-auth-secret');
  if (restAdminSecret === adminSecret) {
    return { authorized: true };
  }

  // Check Authorization header as fallback
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Support both "Bearer <secret>" and direct secret
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (token === adminSecret) {
      return { authorized: true };
    }
  }

  return {
    authorized: false,
    error: 'Invalid or missing admin secret',
  };
}



/**
 * Middleware function to check admin authentication and return error response if unauthorized
 */
export function requireAdminAuth(request: NextRequest): Response | null {
  const authResult = validateAdminAuth(request);

  if (!authResult.authorized) {
    return Response.json(
      {
        error: 'Unauthorized',
        message: authResult.error || 'Admin authentication required',
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'x-rest-auth-secret',
        },
      }
    );
  }

  return null; // No error, authentication passed
}
