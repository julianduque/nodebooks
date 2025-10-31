# Plugin Development Guide

This guide explains how to create custom cell type plugins for NodeBooks. Plugins allow you to extend NodeBooks with new cell types that can be installed from npm.

## Overview

NodeBooks uses a plugin architecture similar to n8n, where special cell types are implemented as separate npm packages. Plugins can register one or more cell types, each with:

- Frontend React components (editor and public view)
- Backend route handlers (optional)
- Zod schemas for data validation
- Metadata (name, description, icon)

## Plugin Structure

A NodeBooks plugin is an npm package that exports a `CellPlugin` object. Here's the basic structure:

```
my-cell-plugin/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Main plugin definition (backend entry point)
│   ├── frontend.ts       # Frontend-only entry point
│   ├── frontend/
│   │   ├── my-cell-view.tsx
│   │   └── public/
│   │       └── public-my-cell.tsx
│   └── backend.ts        # Backend route registration (optional)
└── README.md
```

## Package Configuration

### `package.json`

```json
{
  "name": "@your-org/my-cell-plugin",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./frontend": {
      "types": "./src/frontend.ts",
      "default": "./src/frontend.ts"
    }
  },
  "dependencies": {
    "@nodebooks/cell-plugin-api": "workspace:*",
    "@nodebooks/client-ui": "workspace:*",
    "@nodebooks/notebook-schema": "workspace:*",
    "react": "^18.0.0",
    "zod": "^3.22.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

**Important**: Package names must follow the pattern `@nodebooks/*-cell*` or `@your-org/*-cell*` to be discovered by the plugin system.

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

## Plugin API

### CellPlugin Interface

```typescript
import type { CellPlugin } from "@nodebooks/cell-plugin-api";

const myPlugin: CellPlugin = {
  id: "@your-org/my-cell-plugin",
  version: "0.1.0",
  metadata: {
    name: "My Cell Plugin",
    description: "Description of what this plugin does",
    author: "Your Name",
    homepage: "https://github.com/your-org/my-cell-plugin",
  },
  cells: [
    // Cell type definitions...
  ],
  init: async () => {
    // Optional initialization function
  },
};
```

### CellTypeDefinition

Each cell type in the `cells` array must implement:

```typescript
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import { z } from "zod";

const cellType: CellTypeDefinition = {
  type: "my-cell-type", // Unique identifier
  schema: MyCellSchema, // Zod schema
  metadata: {
    name: "My Cell",
    description: "What this cell type does",
    icon: MyIcon, // Lucide React icon component or string
  },
  frontend: {
    Component: MyCellView,
    PublicComponent: PublicMyCell,
  },
  backend: registerBackendRoutes, // Optional
  createCell: () => createMyCell(),
  enabled: true, // Optional, defaults to true
  serialize: serializeMyCell, // Optional, for file export
  deserialize: deserializeMyCell, // Optional, for file import
};
```

### Serialization Functions

Plugins must provide `serialize` and `deserialize` functions to handle notebook file operations. These convert between runtime cells (with IDs) and file cells (without IDs, compact format).

#### `serialize(cell: NotebookCell): NotebookFileCell`

Converts a runtime cell to file format for saving:

```typescript
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/cell-plugin-api";

const serializeMyCell = (cell: NotebookCell): NotebookFileCell => {
  const myCell = cell as MyCell;
  const result: NotebookFileMyCell = {
    type: "my-cell-type",
    data: myCell.data,
  };

  // Only include non-empty optional fields
  if (myCell.metadata && Object.keys(myCell.metadata).length > 0) {
    result.metadata = myCell.metadata;
  }
  if (myCell.optionalField) {
    result.optionalField = myCell.optionalField;
  }

  return result;
};
```

#### `deserialize(fileCell: NotebookFileCell): NotebookCell`

Converts a file cell to runtime format when loading:

```typescript
const deserializeMyCell = (fileCell: NotebookFileCell): NotebookCell => {
  const myFileCell = fileCell as NotebookFileMyCell;
  return createMyCell({
    metadata: myFileCell.metadata ?? {},
    data: myFileCell.data ?? "",
    optionalField: myFileCell.optionalField,
  });
};
```

**Key differences:**

- Runtime cells always have an `id` (string)
- File cells omit `id` (generated on load)
- File cells omit empty optional fields for compact storage
- Runtime cells have default values applied

## Frontend Components

### Main Cell Component

The `Component` receives `CellComponentProps`:

```typescript
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { NotebookCell } from "@nodebooks/notebook-schema";

interface MyCellViewProps extends CellComponentProps {
  cell: Extract<NotebookCell, { type: "my-cell-type" }>;
  // Add any additional props your component needs
}

const MyCellView = ({
  cell,
  onChange,
  notebookId,
  onRun,
  readOnly,
  path,
}: MyCellViewProps) => {
  // Your component implementation
  return <div>...</div>;
};
```

**Props available:**

- `cell`: The cell data (typed based on your schema)
- `onChange`: Function to update the cell data
- `notebookId`: ID of the current notebook
- `onRun`: Function to execute the cell (optional)
- `readOnly`: Whether the cell is read-only
- `path`: Editor path for Monaco (optional)

### Public Cell Component

The `PublicComponent` receives `PublicCellComponentProps`:

```typescript
import type { PublicCellComponentProps } from "@nodebooks/cell-plugin-api";

const PublicMyCell = ({
  cell,
}: PublicCellComponentProps & {
  cell: Extract<NotebookCell, { type: "my-cell-type" }>;
}) => {
  // Public view implementation (read-only)
  return <div>...</div>;
};
```

### Using Client UI Components

Plugins should use `@nodebooks/client-ui` for shared components:

```typescript
import { Button, Input } from "@nodebooks/client-ui/components/ui";
import { MonacoEditor } from "@nodebooks/client-ui/components/monaco";
```

## Backend Routes (Optional)

If your cell type needs backend API endpoints, create a backend route registration function:

```typescript
// src/backend.ts
import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";

export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager
): void {
  app.post("/api/my-cell/execute", async (request, reply) => {
    // Your route handler
  });
}
```

**Important**: Backend routes are registered under `/api/` automatically. Use descriptive paths like `/api/my-cell/execute`.

### WebSocket Support

Plugins can also register WebSocket upgrade handlers:

```typescript
import type { BackendRouteRegistrar } from "@nodebooks/cell-plugin-api";

export const registerBackendRoutes: BackendRouteRegistrar = (
  app,
  store,
  collaborators,
  kernelSessions
) => {
  // Register HTTP routes
  app.post("/api/my-cell/execute", async (request, reply) => {
    // ...
  });

  // Return WebSocket upgrade handler (optional)
  return (request, socket, head) => {
    // Handle WebSocket upgrade
  };
};
```

## Schema Definition

Define your cell data schema using Zod:

```typescript
import { z } from "zod";
import type { NotebookCell } from "@nodebooks/notebook-schema";

export const MyCellSchema = z.object({
  type: z.literal("my-cell-type"),
  id: z.string(),
  source: z.string().optional(),
  // Add your cell-specific fields
  myField: z.string(),
  myOptionalField: z.number().optional(),
});

export type MyCell = z.infer<typeof MyCellSchema>;

export function createMyCell(): MyCell {
  return {
    type: "my-cell-type",
    id: crypto.randomUUID(),
    myField: "",
  };
}
```

The schema will be automatically validated when cells are created or updated.

## Frontend-Only Entry Point

To avoid bundling Node.js dependencies in the client, create a separate `frontend.ts` file:

```typescript
// src/frontend.ts
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { MyCellSchema, createMyCell } from "@nodebooks/notebook-schema";
import MyCellView from "./frontend/my-cell-view";
import PublicMyCell from "./frontend/public/public-my-cell";

export const myCellPlugin: CellPlugin = {
  id: "@your-org/my-cell-plugin",
  version: "0.1.0",
  metadata: {
    name: "My Cell Plugin",
    description: "Description",
  },
  cells: [
    {
      type: "my-cell-type",
      schema: MyCellSchema,
      metadata: {
        name: "My Cell",
        description: "Description",
        icon: "my-icon",
      },
      frontend: {
        Component: MyCellView,
        PublicComponent: PublicMyCell,
      },
      // Explicitly set backend to undefined for frontend-only entry
      backend: undefined,
      createCell: createMyCell,
    },
  ],
};

export default myCellPlugin;
```

## Example: Complete Single-Cell Plugin

Here's a complete example of a simple "Notes" cell plugin:

### `src/index.ts`

```typescript
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { z } from "zod";
import NotesCellView from "./frontend/notes-cell-view";
import PublicNotesCell from "./frontend/public/public-notes-cell";
import { registerBackendRoutes } from "./backend";

const NotesCellSchema = z.object({
  type: z.literal("notes"),
  id: z.string(),
  content: z.string().default(""),
});

function createNotesCell() {
  return {
    type: "notes" as const,
    id: crypto.randomUUID(),
    content: "",
  };
}

const plugin: CellPlugin = {
  id: "@your-org/notes-cell",
  version: "0.1.0",
  metadata: {
    name: "Notes Cell",
    description: "Add formatted notes to your notebook",
    author: "Your Name",
  },
  cells: [
    {
      type: "notes",
      schema: NotesCellSchema,
      metadata: {
        name: "Notes",
        description: "Add formatted notes",
        icon: "file-text",
      },
      frontend: {
        Component: NotesCellView,
        PublicComponent: PublicNotesCell,
      },
      backend: registerBackendRoutes,
      createCell: createNotesCell,
    },
  ],
};

export default plugin;
```

### `src/frontend.ts`

```typescript
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import NotesCellView from "./frontend/notes-cell-view";
import PublicNotesCell from "./frontend/public/public-notes-cell";
// Import schema and factory from notebook-schema or define locally

export const notesCellPlugin: CellPlugin = {
  // Same as index.ts but with backend: undefined
  // ...
};

export default notesCellPlugin;
```

### `src/frontend/notes-cell-view.tsx`

```typescript
"use client";

import { useState } from "react";
import { Textarea } from "@nodebooks/client-ui/components/ui";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { NotebookCell } from "@nodebooks/notebook-schema";

interface NotesCellViewProps extends CellComponentProps {
  cell: Extract<NotebookCell, { type: "notes" }>;
}

const NotesCellView = ({
  cell,
  onChange,
  readOnly,
}: NotesCellViewProps) => {
  const [content, setContent] = useState(cell.content ?? "");

  const handleChange = (value: string) => {
    setContent(value);
    onChange((current) => ({
      ...current,
      content: value,
    }));
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter your notes..."
        readOnly={readOnly}
        className="min-h-[100px]"
      />
    </div>
  );
};

export default NotesCellView;
```

## Multi-Cell Plugins

A single plugin can register multiple cell types. See `@nodebooks/terminal-cells` for an example that registers both "terminal" and "command" cell types.

## Official Plugin Examples

Reference implementations are available in the NodeBooks monorepo:

- **Single-cell plugin**: `packages/sql-cell/` - SQL query execution
- **Multi-cell plugin**: `packages/terminal-cells/` - Terminal and Command cells
- **Frontend-focused**: `packages/plot-cell/` - Interactive plotting
- **Backend-heavy**: `packages/http-cell/` - HTTP request execution
- **AI integration**: `packages/ai-cell/` - AI assistant interactions

## Publishing Plugins

1. **Package naming**: Use `@your-org/*-cell*` pattern
2. **Versioning**: Follow semantic versioning
3. **Dependencies**: List `@nodebooks/cell-plugin-api`, `@nodebooks/client-ui`, and `@nodebooks/notebook-schema` as dependencies
4. **Exports**: Configure `package.json` exports for both main and frontend entry points
5. **TypeScript**: Ensure types are properly exported

## Installation

Plugins can be installed via the NodeBooks settings UI (admin only) or manually:

```bash
pnpm add @your-org/my-cell-plugin
```

After installation, plugins are automatically discovered and can be enabled/disabled in the settings UI.

## Best Practices

1. **Use TypeScript**: Full type safety is recommended
2. **Reuse client-ui**: Don't duplicate UI components from `@nodebooks/client-ui`
3. **Schema validation**: Always define Zod schemas for your cell data
4. **Error handling**: Handle errors gracefully in both frontend and backend
5. **Accessibility**: Follow WCAG guidelines for UI components
6. **Documentation**: Provide clear README and examples
7. **Testing**: Test your plugin before publishing

## Troubleshooting

### Plugin not discovered

- Check package name follows `*-cell*` pattern
- Verify `package.json` exports are configured correctly
- Ensure plugin is installed in `node_modules`

### Frontend build errors

- Make sure `frontend.ts` sets `backend: undefined`
- Check that Node.js modules aren't imported in frontend code
- Verify all dependencies are listed in `package.json`

### Backend routes not registering

- Ensure `registerBackendRoutes` function signature matches `BackendRouteRegistrar`
- Check that routes are registered under `/api/` prefix
- Verify plugin is enabled in settings

## Additional Resources

- [Plugin API Reference](../../packages/cell-plugin-api/src/index.ts)
- [Official Plugins](../../packages/)
- [Client UI Components](../../packages/client-ui/src/components/)
