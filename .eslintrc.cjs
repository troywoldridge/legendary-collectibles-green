module.exports = {
  // ...your existing config...
  overrides: [
    // allow require + any in scripts
    {
      files: ["scripts/**/*.{js,mjs,ts}"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-explicit-any": "off",
      },
    },

    // OPTIONAL: relax only in admin tooling areas if you want
    {
      files: ["src/app/admin/**/*.{ts,tsx}", "src/app/api/admin/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
