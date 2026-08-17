import globals from "globals";
import pluginJs from "@eslint/js";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/api/**/*.{js,mjs,cjs,jsx}",
      // NX-243: layoutul persistent care deține singura instanță de ChatWidget.
      "src/layouts/**/*.{js,mjs,cjs,jsx}",
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
    // NX-244 a extins tiparul la `.jsx`: rendererul pasiv trăiește tot în `src/chat/**`, iar până
    // acum fișierele JSX de aici nu erau prinse de NICIUN bloc de config — adică frontiera exista
    // pe hârtie, dar nu se aplica exact componentelor care ating domeniul cel mai des.
    files: ["src/chat/**/*.{js,mjs,jsx}"],
    ignores: ["src/chat/contract/generated/**"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
      // NX-245 — accesibilitatea, ca regulă de lint. Suita de teste prinde stările pe care le
      // randează; linterul prinde clasa de greșeli care nu apare în niciun fixture: un `<div>` cu
      // `onClick`, un `<img>` fără `alt`, un `aria-*` scris greșit. Amândouă sunt necesare.
      "jsx-a11y": pluginJsxA11y,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginJsxA11y.flatConfigs.recommended.rules,
      // O regiune care se derulează trebuie să fie focusabilă de la tastatură (axe
      // `scrollable-region-focusable`), iar `group` e rolul care descrie asta fără să pretindă un
      // nume server-owned pe care contractul nu-l are. Fără excepția de aici, cele două verificări
      // s-ar contrazice: linterul ar cere scoaterea lui `tabIndex`, axe ar cere punerea lui.
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "group"], allowExpressionValues: true },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "unused-imports/no-unused-imports": "error",
      // NX-244 — boundary-ul EXECUTABIL. Fără el, „frontend pasiv" e o intenție dintr-un card;
      // cu el, prima încercare de a reintroduce coșul sau catalogul în widget pică la lint.
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
                "@/utils",
                "@/utils/*",
                "../lib/*",
                "../../lib/*",
                "../api/*",
                "../../api/*",
                "../pages/*",
                "../../pages/*",
                "../utils",
                "../../utils",
                // `../components/*` NU e în listă intenționat: din `src/chat/v2/` el înseamnă
                // `src/chat/components/` (legitim), iar din alt nivel înseamnă `src/components/`
                // (interzis). Un tipar de cale nu poate distinge cele două fără să știe adâncimea
                // fișierului. Evadările relative către `src/components/**` sunt prinse de
                // `test/passive-renderer-boundary.test.js`, care REZOLVĂ căile în loc să le
                // potrivească textual.
              ],
              message:
                "src/chat/** e frontiera de contract: fără domeniu (catalog, coș, wishlist, componente v1, formatare de bani).",
            },
          ],
        },
      ],
      // Formatarea de bani/numere NU are ce căuta în renderer: prețul vine text de la server.
      "no-restricted-globals": [
        "error",
        { name: "Intl", message: "NX-244: valorile comerciale vin deja formatate din backend." },
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
