import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repo tiene su propio package-lock.json en la raiz (la API de
  // Fastify) ademas del de esta carpeta; sin esto Turbopack adivina la raiz
  // del workspace y avisa por consola en cada build.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
