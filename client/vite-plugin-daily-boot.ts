import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const BOOT_PATH = path.resolve("public/daily-puzzle.json");

/** Inject today's puzzle JSON into index.html for synchronous first paint. */
export function dailyBootPlugin(): Plugin {
  return {
    name: "daily-boot",
    transformIndexHtml(html) {
      let puzzle: unknown = null;
      try {
        if (fs.existsSync(BOOT_PATH)) {
          puzzle = JSON.parse(fs.readFileSync(BOOT_PATH, "utf8"));
        }
      } catch {
        // Skip invalid embed.
      }

      if (!puzzle) return html;

      const bootTag = `<script type="application/json" id="pathways-daily-boot">${JSON.stringify(puzzle)}</script>`;
      const preloadTag = `<link rel="preload" href="/daily-puzzle.json" as="fetch" crossorigin="anonymous" />`;

      return html.replace("</head>", `${bootTag}\n    ${preloadTag}\n  </head>`);
    },
  };
}
