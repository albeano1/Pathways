import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const EMBED_MAP_PATH = path.resolve("public/daily-embed.json");
const BOOT_PATH = path.resolve("public/daily-puzzle.json");
const STEP_CONTEXT_PATH = path.resolve("public/daily-step-context.json");

function readJson(filePath: string): unknown {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch {
    // Skip invalid embed.
  }
  return null;
}

/** Inject today's puzzle JSON into index.html for synchronous first paint. */
export function dailyBootPlugin(): Plugin {
  return {
    name: "daily-boot",
    transformIndexHtml(html) {
      // Prefer the multi-day embed map (zero-network paint for days after deploy);
      // fall back to the single-day puzzle for back-compat.
      const embedMap = readJson(EMBED_MAP_PATH);
      const boot = embedMap ?? readJson(BOOT_PATH);
      if (!boot) return html;

      const bootTag = `<script type="application/json" id="pathways-daily-boot">${JSON.stringify(boot)}</script>`;

      const stepContext = readJson(STEP_CONTEXT_PATH);
      const stepContextTag = stepContext
        ? `\n    <script type="application/json" id="pathways-step-context-boot">${JSON.stringify(stepContext)}</script>`
        : "";

      return html.replace("</head>", `${bootTag}${stepContextTag}\n  </head>`);
    },
  };
}
