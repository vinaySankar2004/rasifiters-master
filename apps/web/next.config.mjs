/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // The in-app policy copy was retired for the one public page (privacy-policy D-ONE); old links land there.
  async redirects() {
    return [{ source: "/program/privacy", destination: "/privacy-policy", permanent: true }];
  }
};

export default nextConfig;
