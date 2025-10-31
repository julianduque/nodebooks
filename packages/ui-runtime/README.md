# @nodebooks/ui-runtime

Lightweight helper library that exposes the server-side UI primitives used inside NodeBooks notebooks.

## Usage

```ts
import { markdown, table } from "@nodebooks/ui-runtime";

export function renderSummary() {
  return markdown("# Hello from NodeBooks!");
}
```

The package also re-exports the `Ui*` constructors and the default `ui` alias, matching the helpers described in the NodeBooks docs.
