/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 'standalone' é necessário para a imagem Docker de produção (Fase 12), mas
  // o tracing cria symlinks que falham no Windows sem modo developer.
  // Activado via env (o Dockerfile define BUILD_STANDALONE=1).
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  transpilePackages: ['@ants/ui', '@ants/shared'],
};

export default nextConfig;
