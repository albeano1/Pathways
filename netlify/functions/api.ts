import serverless from "serverless-http";
import { bootstrapGraphDbPath } from "../../server/dist/server/src/bootstrapGraphDb.js";
import { createApp } from "../../server/dist/server/src/app.js";

let serverlessHandler: ReturnType<typeof serverless> | undefined;

function getHandler() {
  if (!serverlessHandler) {
    bootstrapGraphDbPath();
    const { app } = createApp({ serveClient: false });
    serverlessHandler = serverless(app);
  }
  return serverlessHandler;
}

export const handler = async (event: unknown, context: unknown) => {
  try {
    return await getHandler()(event, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valid: false,
        failureType: "not_in_graph",
        error: message,
      }),
    };
  }
};
