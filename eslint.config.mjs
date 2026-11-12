import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      next: { rootDir: ["apps/web", "apps/inventory", "apps/workspace"] },
    },
  },
  globalIgnores([
    "**/.next/**",
    ".m2/**",
    ".pnpm-store/**",
    "backend/target/**",
    "backend/.verify-target/**",
    "**/out/**",
    "**/next-env.d.ts",
    "**/playwright-report/**",
    "**/test-results/**",
  ]),
]);
