import path from "node:path";

export { getDbPath, bootstrapGraphDbPath } from "./bootstrapGraphDb.js";

export const CLIENT_DIST = path.join(process.cwd(), "client/dist");
