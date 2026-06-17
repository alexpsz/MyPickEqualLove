import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  jsxA11y.flatConfigs.recommended,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
