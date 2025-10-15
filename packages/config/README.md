# @nodebooks/config

Shared configuration loaders, schemas, and helpers used by the NodeBooks CLI, server, and runtimes.

## Usage

```ts
import { loadServerConfig } from "@nodebooks/config";

const config = loadServerConfig();
console.log(config.port, config.host);
```
