# OuterSpatial SQLite Export Service

A standalone Next.js service for generating and managing SQLite databases for OuterSpatial communities.

## Overview

This service provides API endpoints to:
- Generate SQLite databases for all communities
- Generate SQLite database for a specific community
- List all available SQLite databases

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy `.env.example` to `.env.local` and configure:
```bash
cp .env.example .env.local
```

3. Run the development server:
```bash
pnpm dev
```

## API Endpoints

### POST /api/export/sqlite/all
Generate SQLite databases for all communities.

Headers:
- `Authorization: Bearer <AUTH_SECRET>`

Body (optional):
```json
{
  "force": true  // Force regeneration even if no changes
}
```

### POST /api/export/sqlite/one
Generate SQLite database for a specific community.

Headers:
- `Authorization: Bearer <AUTH_SECRET>`

Body:
```json
{
  "communityId": 123,
  "force": false  // Optional: force regeneration
}
```

### GET /api/export/sqlite/list
List all available SQLite databases.

Headers:
- `Authorization: Bearer <AUTH_SECRET>`

## Environment Variables

- `AUTH_SECRET` - Secret key for API authentication
- `DATABASE_URL` - PostgreSQL connection string
- `GRAPHQL_URL` - Hasura GraphQL endpoint
- `HASURA_ADMIN_SECRET` - Hasura admin secret
- `AWS_REGION` - AWS region for S3
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_BUCKET` - S3 bucket for SQLite storage

## Development

Run tests:
```bash
pnpm test
```

Build for production:
```bash
pnpm build
```

## Deployment

This service is designed to be deployed on Vercel or any Node.js hosting platform that supports Next.js.