import { ApolloClient, ApolloLink, createHttpLink, from, InMemoryCache } from '@apollo/client/core';
import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';

interface GraphQLConfig {
  uri: string;
  adminSecret: string;
}

function getGraphQLConfig(): GraphQLConfig {
  // Retrieve GraphQL configuration from environment variables
  const uri = process.env.GRAPHQL_URL;
  const adminSecret = process.env.HASURA_ADMIN_SECRET;

  if (!uri) {
    throw new Error('GRAPHQL_URL environment variable is required');
  }
  if (!adminSecret) {
    throw new Error('HASURA_ADMIN_SECRET environment variable is required');
  }

  return { uri, adminSecret };
}

// Create HTTP agents with connection pooling and limits
const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 10, // Limit concurrent connections
  maxFreeSockets: 5,
  timeout: 30000,
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 10, // Limit concurrent connections
  maxFreeSockets: 5,
  timeout: 30000,
});

// Custom fetch with connection pooling and error handling
async function customFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const isHttps = url.startsWith('https:');
  const agent = isHttps ? httpsAgent : httpAgent;

  const fetchOptions: RequestInit = {
    ...options,
    // @ts-expect-error - Node.js specific option
    agent,
    timeout: 30000,
  };

  try {
    const response = await fetch(input, fetchOptions);
    return response;
  } catch (error) {
    const errorDetails = {
      url: url.replace(/key=[^&]+/, 'key=[REDACTED]'),
      error: error instanceof Error ? error.message : 'Unknown error',
      code: error instanceof Error && 'code' in error ? error.code : undefined,
      cause: error instanceof Error && 'cause' in error ? error.cause : undefined,
    };

    console.error('GraphQL fetch error:', errorDetails);

    // Add specific handling for EMFILE errors
    if (error instanceof Error && 'code' in error && error.code === 'EMFILE') {
      console.error('EMFILE error detected - too many open files. Consider reducing concurrency.');
    }

    throw error;
  }
}

// Create admin client with Hasura admin secret
export const createAdminClient = (): ApolloClient<unknown> => {
  const config = getGraphQLConfig();

  const authMiddleware = new ApolloLink((operation, forward) => {
    operation.setContext({
      headers: {
        'x-hasura-admin-secret': config.adminSecret,
      },
    });

    return forward(operation);
  });

  const httpLink = createHttpLink({
    uri: config.uri,
    fetch: customFetch,
    fetchOptions: {
      keepalive: true,
      timeout: 30000,
    },
  });

  return new ApolloClient({
    name: 'outerspatial-rest-admin',
    cache: new InMemoryCache({
      addTypename: false,
    }),
    headers: {
      'X-Hasura-Client-Name': 'outerspatial-rest-admin',
    },
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache',
        errorPolicy: 'all',
      },
    },
    link: from([authMiddleware, httpLink]),
  });
};

// Create user client with JWT token
export const createUserClient = (token: string): ApolloClient<unknown> => {
  const uri = process.env.NEXT_PUBLIC_GRAPHQL_URL;
  const authMiddleware = new ApolloLink((operation, forward) => {
    operation.setContext(({ headers }: { headers?: Record<string, string> }) => ({
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    }));

    return forward(operation);
  });

  const httpLink = createHttpLink({
    uri: uri,
    fetch: customFetch,
    fetchOptions: {
      keepalive: true,
      timeout: 30000,
    },
  });

  return new ApolloClient({
    name: 'outerspatial-rest-user',
    cache: new InMemoryCache({
      addTypename: false,
    }),
    headers: {
      'X-Hasura-Client-Name': 'outerspatial-rest-user',
    },
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache',
        errorPolicy: 'all',
      },
    },
    link: from([authMiddleware, httpLink]),
  });
};

// Default admin client instance (singleton)
let defaultAdminClient: ApolloClient<unknown> | null = null;

export const getAdminClient = (): ApolloClient<unknown> => {
  if (!defaultAdminClient) {
    defaultAdminClient = createAdminClient();
  }
  return defaultAdminClient;
};

// Default export for backward compatibility - lazily initialized
const adminClient = new Proxy({} as ApolloClient<unknown>, {
  get(_target, prop: string | symbol) {
    const client = getAdminClient();
    // @ts-expect-error - Dynamic property access
    return client[prop];
  },
});

export default adminClient;
