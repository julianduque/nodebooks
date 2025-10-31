# @nodebooks/client-ui

Shared UI components and utilities for NodeBooks client applications and plugins.

This package contains reusable components extracted from the main client app, including:

- UI components (shadcn components)
- Monaco editor utilities and wrappers
- Output rendering components
- Shared utility functions
- Type definitions

## Usage

```typescript
import { Button, MonacoEditor, OutputView } from "@nodebooks/client-ui";
```

## Theme Configuration

This package uses Tailwind v4's `@theme` directive to define color tokens needed for utility generation (e.g., `bg-primary`, `hover:bg-primary/90`). These are **build-time defaults** only.

**The consuming application owns the runtime theme.** To ensure your app's theme takes precedence:

1. Import this package's styles **before** your app's theme CSS:

   ```typescript
   import "@nodebooks/client-ui/styles.css";
   import "./globals.css"; // Your app theme - loaded last to override
   ```

2. Define the same CSS custom properties in your app's CSS to override the defaults:
   ```css
   :root {
     --color-primary: oklch(0.723 0.219 149.579);
     --color-accent: oklch(0.967 0.001 286.375);
     /* ... other theme colors */
   }
   ```

The default theme colors in `src/styles.css` should match `apps/client/app/globals.css` for consistency, but the client app is the source of truth.
