import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    // shadcn/Radix-style TS components carry their own typed props;
    // react/prop-types is noise for a TypeScript codebase.
    rules: {
      "react/prop-types": "off",
    },
  },
];
