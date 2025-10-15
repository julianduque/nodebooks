# @nodebooks/notebook-schema

Zod schemas that model notebooks, cells, outputs, and runtime metadata shared across the NodeBooks platform.

## Usage

```ts
import { NotebookSchema } from "@nodebooks/notebook-schema";

const parsed = NotebookSchema.parse(payload);
```
