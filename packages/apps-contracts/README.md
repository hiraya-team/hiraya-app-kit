# `@hiraya-team/apps-contracts`

Protocol types and strict runtime validation shared by Hiraya app hosts and sandboxed apps.

```ts
import { parseManifestV2 } from "@hiraya-team/apps-contracts";
import { parseCustomTheme, parseThemeTokens } from "@hiraya-team/apps-contracts/theme";
```

The `theme` subpath contains portable theme definitions and the semantic runtime tokens supplied to applications. Rendering, persistence, and built-in desktop themes are outside this package.

Protocol version 1 includes packaged-app Back coordination through `app.setBackHandler`, `app.backRequested`, and `app.resolveBackRequest`. Hosts send a unique request ID and apps resolve it as `handled`, `home`, or `failed`.
