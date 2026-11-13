// Copyright 2026 Ayush Kumar Shaw
// SPDX-License-Identifier: Apache-2.0

// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // The bundled helper is generated from src/ by `npm run build`.
  { ignores: ["node_modules/", "dist/", "skills/cutwater/scripts/cutwater.mjs"] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["test/fake-gh/**", "sandbox/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
