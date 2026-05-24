/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Build'i lint hatalarıyla bloklama (kozmetik kurallar). Tip kontrolü (tsc) ayrıca çalışır.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
