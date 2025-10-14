// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import * as tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import nextPlugin from "@next/eslint-plugin-next";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use compat to pull in Next’s recommended sets in Flat world
const compat = new FlatCompat({ baseDirectory: __dirname });

export default defineConfig([
  // Ignore patterns
  {
    ignores: [
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "**/.storybook/**",
      "**/coverage/**",
      "**/*.min.*",
      "**/generated/**",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (type-checked, strict)
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,

  // React & Next
  reactPlugin.configs.flat.recommended,
  reactHooks.configs.recommended,
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Accessibility
  jsxA11y.flatConfigs.recommended,

  // Imports hygiene
  importPlugin.flatConfigs.recommended,

  // Global parser/options + core rules
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { JSX: "readonly" },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      import: importPlugin,
      "unused-imports": unusedImports,
      "@next/next": nextPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // TypeScript strictness (kept minimal for now)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Unused code
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // Import order (lightweight)
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "object",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-unresolved": "off", // TS + path aliases handle this

      // React/Next tweaks
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "off",

      // General JS sanity
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // Node scripts & config files (looser; no TS project required)
  {
    files: ["**/*.cjs", "**/*.mjs", "scripts/**/*.{js,ts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: null },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },

  // Tests
  {
    files: ["**/*.{spec,test}.{ts,tsx,js,jsx}"],
    rules: { "no-console": "off" },
  },
]);
