/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

// Only use serwist in production to avoid compile spam in dev
if (process.env.NODE_ENV === 'production') {
  const withSerwist = require('@serwist/next').default({
    swSrc: 'src/sw.ts',
    swDest: 'public/sw.js',
  });
  module.exports = withSerwist(nextConfig);
} else {
  module.exports = nextConfig;
}
