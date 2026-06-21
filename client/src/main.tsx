import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getBootSnapshot } from "./bootstrapGame";
import { prefetchDailyPuzzle } from "./prefetchPuzzle";
import { warmApi } from "./warmApi";

const boot = getBootSnapshot();
warmApi(boot.puzzle?.end);
void prefetchDailyPuzzle();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
