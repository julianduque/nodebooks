import { createServer } from "./server.js";
import { loadServerConfig } from "@nodebooks/config";

const bootstrap = async () => {
  const server = await createServer();
  const { port, host } = loadServerConfig();
  await server.listen({ port, host });
  server.log.info(`NodeBooks server listening on http://${host}:${port}`);
};

bootstrap().catch((error) => {
  console.error("Failed to start NodeBooks server", error);
  process.exit(1);
});
