import serverless from "serverless-http";
import { createApp } from "../../server/dist/server/src/app.js";

const { app } = createApp({ serveClient: false });

export const handler = serverless(app);
