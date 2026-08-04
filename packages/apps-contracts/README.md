# `@hiraya-team/apps-contracts`

Protocol types and strict runtime validation shared by Hiraya app hosts and sandboxed apps.

```ts
import { parseManifestV2 } from "@hiraya-team/apps-contracts";
import { parseCustomTheme } from "@hiraya-team/apps-contracts/theme";
```

The `theme` subpath contains only portable theme types and validation. Rendering, persistence, and built-in desktop themes are outside this package.
