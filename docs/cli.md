# CLI

```bash
pnpm build
node ./cli/dist/bin.js init
node ./cli/dist/bin.js status
node ./cli/dist/bin.js index rebuild
node ./cli/dist/bin.js graph build
node ./cli/dist/bin.js impact packages/core/src/index.ts
node ./cli/dist/bin.js context "createRuntime" --budget small
node ./cli/dist/bin.js health
node ./cli/dist/bin.js flow list
```

Binary names after linking: `arc`, `arcframe`.
