# Hiraya App Kit

Public contracts, browser SDK, and packaging CLI for third-party Hiraya apps.

## Packages

- `@hiraya-team/apps-contracts` provides protocol types and strict boundary validation. Portable desktop-theme contracts are available from `@hiraya-team/apps-contracts/theme`.
- `@hiraya-team/apps-sdk` provides the typed browser client used inside the Hiraya app sandbox.
- `@hiraya-team/app-cli` provides Node-free archive inspection from its root export and the `hiraya-app` executable for creating, validating, inspecting, and deterministically packaging apps and themes.

## Create An App

```sh
bunx @hiraya-team/app-cli init my-app com.example.my-app
cd my-app
bun install
bun run build
bun run package
```

The generated Vanilla TypeScript project contains its complete author guide in `AGENTS.md`.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run lint
bun run build
bun run pack:check
```

All packages publish compiled ESM JavaScript and declarations from `dist`. Internal package versions are released together and pinned exactly.

## License

MIT
