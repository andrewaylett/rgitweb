import andrewaylett from "eslint-config-andrewaylett";

const typed = andrewaylett.configs.recommendedWithJestWithReactWithTypes;

export default [
  {
    ignores: ["dist/", "build/", "coverage/", "node_modules/"],
  },
  {
    // TypeScript sources get typed linting; projectService is ours to supply
    // because it depends on this repo's layout.
    files: ["src/**/*.{ts,tsx}", "test/**/*.ts", "vite.config.ts"],
    ...typed,
    languageOptions: {
      ...typed.languageOptions,
      parserOptions: {
        ...typed.languageOptions.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // This project uses the automatic JSX runtime (tsconfig "jsx":
    // "react-jsx"), so React need not be in scope for JSX.
    files: ["src/**/*.tsx"],
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    // Plain-JS config files at the repo root: no type information available.
    files: ["*.js"],
    ...andrewaylett.configs.recommendedWithoutTypescript,
    languageOptions: {
      ...andrewaylett.configs.recommendedWithoutTypescript.languageOptions,
      // The preset pins 2018, which predates import.meta.
      ecmaVersion: "latest",
    },
  },
];
