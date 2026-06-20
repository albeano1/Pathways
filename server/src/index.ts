import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const { app, wordCount } = createApp({ serveClient: process.env.NODE_ENV === "production" });

app.listen(PORT, () => {
  console.log(
    `Server running at http://localhost:${PORT} (${wordCount.toLocaleString()} words)`
  );
});
