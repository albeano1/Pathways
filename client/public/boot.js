(function () {
  var SESSION_BOOT_KEY = "pathways.puzzle.boot.v1";

  function pacificDateKey() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function isValidPuzzle(puzzle, date) {
    return (
      puzzle &&
      puzzle.puzzleDate === date &&
      puzzle.id &&
      puzzle.id.indexOf("gen-") === 0 &&
      puzzle.start &&
      puzzle.end
    );
  }

  function storeBootPuzzle(date, puzzle) {
    try {
      sessionStorage.setItem(
        SESSION_BOOT_KEY,
        JSON.stringify({ puzzleDate: date, puzzle: puzzle })
      );
    } catch (error) {}
  }

  function readEmbeddedBoot(date) {
    var el = document.getElementById("pathways-daily-boot");
    if (!el || !el.textContent) return null;
    try {
      var parsed = JSON.parse(el.textContent);
      // Multi-day map keyed by date, or a legacy single puzzle object.
      var puzzle = parsed && parsed.puzzleDate === undefined ? parsed[date] : parsed;
      return isValidPuzzle(puzzle, date) ? puzzle : null;
    } catch (error) {
      return null;
    }
  }

  function readEmbeddedStepContext(end, start) {
    var el = document.getElementById("pathways-step-context-boot");
    if (!el || !el.textContent) return null;
    try {
      var context = JSON.parse(el.textContent);
      if (
        context &&
        context.end === end &&
        context.lookups &&
        context.path &&
        context.path.length === 1 &&
        context.path[0] === start
      ) {
        return context;
      }
    } catch (error) {}
    return null;
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Fetch failed");
      return response.json();
    });
  }

  function warmGraph(end) {
    var query = end ? "?end=" + encodeURIComponent(end) : "";
    fetch("/api/health" + query, { cache: "no-store" }).catch(function () {});
  }

  function isValidStepContext(context, end, start) {
    return (
      context &&
      context.end === end &&
      context.lookups &&
      context.path &&
      context.path.length === 1 &&
      context.path[0] === start
    );
  }

  function warmStepContext(end, start) {
    if (window.__pathwaysStepContextBoot) return;

    var embedded = readEmbeddedStepContext(end, start);
    if (embedded) {
      window.__pathwaysStepContextBoot = Promise.resolve(embedded);
      return;
    }

    var date = pacificDateKey();
    // Prefer the precomputed static file (CDN, no cold function); fall back to the API.
    window.__pathwaysStepContextBoot = fetchJson("/daily/" + date + ".step.json")
      .then(function (context) {
        if (isValidStepContext(context, end, start)) return context;
        throw new Error("Static step context out of date");
      })
      .catch(function () {
        return fetch(
          "/api/step-context?end=" +
            encodeURIComponent(end) +
            "&path=" +
            encodeURIComponent(start),
          { cache: "no-store" }
        )
          .then(function (response) {
            if (!response.ok) throw new Error("Step context failed");
            return response.json();
          })
          .catch(function () {
            return null;
          });
      });
  }

  var date = pacificDateKey();
  var embedded = readEmbeddedBoot(date);
  if (embedded) {
    storeBootPuzzle(date, embedded);
    window.__pathwaysPuzzlePrefetch = Promise.resolve(embedded);
    warmGraph(embedded.end);
    warmStepContext(embedded.end, embedded.start);
  }

  // Reconcile against the precomputed static file first (CDN, no cold function);
  // only wake the serverless API when the static window does not cover today.
  function fetchPuzzleFromApi() {
    return fetchJson("/api/puzzle?date=" + encodeURIComponent(date)).then(function (
      puzzle
    ) {
      if (isValidPuzzle(puzzle, date)) {
        storeBootPuzzle(date, puzzle);
      }
      return puzzle;
    });
  }

  window.__pathwaysPuzzleRefresh = fetchJson("/daily/" + date + ".json")
    .then(function (puzzle) {
      if (!isValidPuzzle(puzzle, date)) throw new Error("Static puzzle out of date");
      storeBootPuzzle(date, puzzle);
      return puzzle;
    })
    .catch(function () {
      return fetchPuzzleFromApi().catch(function () {});
    });

  if (!window.__pathwaysPuzzlePrefetch) {
    window.__pathwaysPuzzlePrefetch = window.__pathwaysPuzzleRefresh;
  }

  window.__pathwaysPuzzlePrefetch
    .then(function (puzzle) {
      if (puzzle && puzzle.end) {
        warmGraph(puzzle.end);
        warmStepContext(puzzle.end, puzzle.start);
      }
    })
    .catch(function () {});
})();
