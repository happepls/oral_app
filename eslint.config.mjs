import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["**/node_modules/**", "client/build/**", "quality/artifacts/**", "client/src/utils/websocket-optimized-connector.js", "client/src/pages/Conversation-websocket.js", "services/user-service/src/health-check.js"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    files: ["client/src/**/*.{js,jsx}"],
    plugins: { "react-hooks": pluginReactHooks },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": "warn",
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "react/display-name": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    },
    settings: { react: { version: "detect" } }
  },
  {
    files: ["client/src/__tests__/**/*.{js,jsx}", "client/src/setupTests.js"],
    languageOptions: { globals: globals.jest }
  },
  {
    files: ["services/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-empty": "warn"
    }
  },
  {
    files: ["services/**/__tests__/**/*.js"],
    languageOptions: { globals: globals.jest }
  },
]);
