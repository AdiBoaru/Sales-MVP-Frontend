import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/api/**/*.{js,mjs,cjs,jsx}",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // NX-242 — frontiera de contract. `src/chat/**` are voie să știe forma payloadului v2 și
  // NIMIC din domeniu: fără catalog, fără coș, fără componente, fără client de date. În clipa în
  // care decoderul poate importa `lib/cart`, redevine motorul al doilea pe care cardul îl scoate.
  {
    files: ["src/chat/**/*.{js,mjs}"],
    ignores: ["src/chat/contract/generated/**"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/*",
                "@/api/*",
                "@/components/*",
                "@/pages/*",
                "../lib/*",
                "../../lib/*",
                "../api/*",
                "../../api/*",
                "../components/*",
                "../../components/*",
                "../pages/*",
                "../../pages/*",
              ],
              message:
                "src/chat/** e frontiera de contract: fără domeniu (catalog, coș, componente, transport).",
            },
          ],
        },
      ],
    },
  },
  // Scripturile de build rulează în Node, nu în browser.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: { ...pluginJs.configs.recommended.rules },
  },
  // Artifactele generate nu se lintează: sunt cod emis de AJV, verificat prin regenerare.
  { ignores: ["src/chat/contract/generated/**"] },
];
