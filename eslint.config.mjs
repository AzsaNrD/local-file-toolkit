import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Desktop wrapper and build scripts are plain CommonJS/Node files, not app code.
    "electron/**",
    "scripts/**",
    "dist-electron/**",
    // Third-party minified files copied into public/ (PDF worker, OCR engine, image compressor).
    "public/**",
  ]),
]);

export default eslintConfig;
