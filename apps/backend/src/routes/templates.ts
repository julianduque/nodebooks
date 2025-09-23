import type { FastifyInstance } from "fastify";
import { listTemplateSummaries } from "../templates/index.js";

export const registerTemplateRoutes = (app: FastifyInstance) => {
  app.get("/templates", async () => {
    return {
      data: listTemplateSummaries(),
    };
  });
};
