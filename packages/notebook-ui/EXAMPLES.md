# Notebook UI Display Examples

These snippets are meant to be pasted directly into a code cell. Return the helper call or the display object as the final expression (don’t console.log).

Import helpers from `@nodebooks/ui` or return the literal display object.

- Helpers: `UiImage`, `UiMarkdown`, `UiHTML`, `UiJSON`, `UiCode`
- Literal objects: `{ ui: "image" | "markdown" | "html" | "json" | "code", ... }`

Note: For async work (like fetching an image and converting to base64), wrap in an async IIFE and return the result.

## Image

Basic URL image

```ts
import { UiImage } from "@nodebooks/ui";
UiImage("https://picsum.photos/seed/nodebooks/600/320", {
  alt: "Random image",
  width: 600,
  height: 320,
  fit: "cover",
  borderRadius: 8,
});
```

Fetch → base64 (async)

```ts
import { UiImage } from "@nodebooks/ui";
(async () => {
  const res = await fetch("https://picsum.photos/seed/base64/300/200");
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return UiImage(b64, {
    mimeType: mime,
    alt: "Fetched base64",
    width: 300,
    height: 200,
  });
})();
```

Inline data URL (literal)

```ts
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">
  <rect width="160" height="90" fill="#0ea5e9"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-size="16">Nodebooks</text>
</svg>`;
const data = Buffer.from(svg, "utf8").toString("base64");
({
  ui: "image",
  src: `data:image/svg+xml;base64,${data}`,
  alt: "Inline SVG",
  width: 160,
  height: 90,
});
```

## Markdown

Helper

```ts
import { UiMarkdown } from "@nodebooks/ui";
UiMarkdown(
  `# Title\n\n- Bullet\n- List with **bold** and _italic_\n\n\n\nCode:\n\n\`\`\`js\nconsole.log('hello');\n\`\`\``
);
```

Literal

```ts
({
  ui: "markdown",
  markdown: "## Subheading\n\nParagraph with a [link](https://example.com).",
});
```

## HTML (sanitized)

Helper

```ts
import { UiHTML } from "@nodebooks/ui";
UiHTML('<div style="color:#0ea5e9"><strong>Hello</strong> <em>HTML</em></div>');
```

Script/style tags are stripped by sanitizer

```ts
import { UiHTML } from "@nodebooks/ui";
UiHTML('<div><script>alert("x")</script>Safe content only</div>');
```

## JSON Viewer

Nested object, expanded

```ts
import { UiJSON } from "@nodebooks/ui";
UiJSON(
  {
    a: 1,
    b: true,
    list: [1, 2, { nested: "value" }],
    deep: { x: { y: { z: 3 } } },
  },
  { collapsed: false, maxDepth: 4 }
);
```

Collapsed by default

```ts
import { UiJSON } from "@nodebooks/ui";
UiJSON({ large: Array.from({ length: 50 }, (_, i) => i) }, { collapsed: true });
```

Literal

```ts
({ ui: "json", json: { hello: "world" }, collapsed: false, maxDepth: 3 });
```

## Code Block

Helper with language

```ts
import { UiCode } from "@nodebooks/ui";
UiCode(
  `function greet(name) {\n  return \`Hello, \${name}\`;\n}\nconsole.log(greet("Nodebooks"));`,
  { language: "js", wrap: false }
);
```

Wrapped long code lines

```ts
import { UiCode } from "@nodebooks/ui";
UiCode("const text = 'a'.repeat(200)\nconsole.log(text)", {
  language: "js",
  wrap: true,
});
```

Literal

```ts
({ ui: "code", code: "let x: number = 42;", language: "ts" });
```

## Tips

- The last expression in the cell is captured as display output.
- Use an async IIFE to await fetch or other promises.
- For raw base64 images, set `mimeType` to ensure correct rendering.
- Width/height accept numbers (px) or CSS strings (e.g., "100%").
