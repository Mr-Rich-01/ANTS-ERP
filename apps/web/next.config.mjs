/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 'standalone' e necessario para as imagens Docker de producao/staging, mas
  // o tracing cria symlinks que falham no Windows sem modo developer.
  // Activado via env (o Dockerfile define BUILD_STANDALONE=1).
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  transpilePackages: ['@ants/ui', '@ants/shared', '@ants/domain', '@ants/database'],
  // Módulos nativos / pesados não devem ser empacotados pelo bundler do servidor.
  experimental: {
    // Upload do logótipo (S4): 1 MB de imagem + overhead multipart excede o
    // limite por omissão (1 MB) das server actions.
    serverActions: { bodySizeLimit: '2mb' },
    serverComponentsExternalPackages: ['@node-rs/argon2', '@prisma/client'],
    outputFileTracingIncludes: {
      '/*': ['./node_modules/@node-rs/**/*'],
    },
  },
  // @ants/domain é transpilado (transpilePackages), o que arrasta a sua dependência
  // nativa @node-rs/argon2 para o bundle. Forçamos a externalização no servidor.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]),
        '@node-rs/argon2',
      ];
    }
    return config;
  },
};

export default nextConfig;
