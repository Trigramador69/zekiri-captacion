import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar una copia de prueba sin pisar la carpeta .next del servidor en uso.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // La carpeta web es la raíz del proyecto (hay otro lockfile en la carpeta del usuario).
  outputFileTracingRoot: path.resolve(process.cwd()),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
