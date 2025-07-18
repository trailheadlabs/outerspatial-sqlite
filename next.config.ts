import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
   // Turbopack configuration (now stable in Next.js 15.3)
  turbopack: {
    // Enable module resolution optimizations
    resolveAlias: {
      // Add any custom aliases if needed
    },
  },

  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Disable powered by header for security
  poweredByHeader: false,

  // TypeScript configuration
  typescript: {
    // During development, we want to see TypeScript errors
    ignoreBuildErrors: false,
  },

  // Enable source maps in development
  productionBrowserSourceMaps: false,

  // Experimental features for better debugging
  experimental: {
    // Enable source maps for server components
    serverSourceMaps: true,
  },

  // Webpack configuration for development debugging
  webpack: (config, { dev }) => {
    if (dev) {
      // Use cheap-module-source-map for better debugging with Turbopack
      config.devtool = 'cheap-module-source-map';

      // Ensure source maps are generated for all files
      if (config.module?.rules) {
        config.module.rules.push({
          test: /\.(js|jsx|ts|tsx)$/,
          use: ['source-map-loader'],
          enforce: 'pre',
          exclude: /node_modules/,
        });
      }
    }

    return config;
  },  
};

export default nextConfig;