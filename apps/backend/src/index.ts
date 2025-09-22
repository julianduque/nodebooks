import { createServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const bootstrap = async () => {
  const server = await createServer();
  await server.listen({ port, host });
  server.log.info(`NodeBooks server listening on http://${host}:${port}`);
};

bootstrap().catch((error) => {
  console.error("Failed to start NodeBooks server", error);
  process.exit(1);
});
