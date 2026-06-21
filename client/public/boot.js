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
      var puzzle = JSON.parse(el.textContent);
      return isValidPuzzle(puzzle, date) ? puzzle : null;
    } catch (error) {
      return null;
    }
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Fetch failed");
      return response.json();
    });
  }

  var date = pacificDateKey();
  var embedded = readEmbeddedBoot(date);
  if (embedded) {
    storeBootPuzzle(date, embedded);
    window.__pathwaysPuzzlePrefetch = Promise.resolve(embedded);
  }

  window.__pathwaysPuzzleRefresh = fetchJson(
    "/api/puzzle?date=" + encodeURIComponent(date)
  )
    .then(function (puzzle) {
      if (isValidPuzzle(puzzle, date)) {
        storeBootPuzzle(date, puzzle);
      }
      return puzzle;
    })
    .catch(function () {});

  if (!window.__pathwaysPuzzlePrefetch) {
    window.__pathwaysPuzzlePrefetch = fetchJson("/daily-puzzle.json")
      .then(function (puzzle) {
        if (!isValidPuzzle(puzzle, date)) throw new Error("Static puzzle out of date");
        storeBootPuzzle(date, puzzle);
        return puzzle;
      })
      .catch(function () {
        return window.__pathwaysPuzzleRefresh;
      });
  }

  fetch("/api/health", { cache: "no-store" }).catch(function () {});
})();
