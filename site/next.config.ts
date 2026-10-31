import type { NextConfig } from 'next';

// Static export: `npm run build` writes a plain site to out/, hostable anywhere.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default config;
