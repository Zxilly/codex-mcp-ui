import antfu from "@antfu/eslint-config"

export default antfu({
  typescript: true,
  react: true,
  stylistic: {
    indent: 2,
    quotes: "double",
    semi: false,
  },
  ignores: [
    "dist",
    "test-results",
    "playwright-report",
    // shadcn/ui primitives legitimately co-export cva variant factories.
    "src/components/ui/**",
  ],
})
