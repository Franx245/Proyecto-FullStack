const BOOT_MARK = "admin-boot-start";
const DATA_READY_MARK = "admin-data-ready";
let bootReported = false;

export function markDataReady() {
  if (bootReported) {
    return;
  }

  try {
    performance.mark(DATA_READY_MARK);
    performance.measure("admin-data-ready-time", BOOT_MARK, DATA_READY_MARK);
  } catch {}
}

export function reportBootMetrics() {
  if (bootReported) {
    return;
  }

  bootReported = true;

  try {
    const bootMark = performance.getEntriesByName(BOOT_MARK, "mark")[0];
    if (!bootMark) {
      return;
    }

    const bootOrigin = bootMark.startTime;

    const paintEntries = performance.getEntriesByType("paint");
    const fcp = paintEntries.find((e) => e.name === "first-contentful-paint");
    const shellPaint = performance.getEntriesByName("admin-tti")[0];
    const dataReady = performance.getEntriesByName("admin-data-ready-time")[0];

    const resources = performance.getEntriesByType("resource").filter((r) => {
      if (r.initiatorType !== "fetch" && r.initiatorType !== "xmlhttprequest") {
        return false;
      }

      return r.startTime >= bootOrigin;
    });

    const apiRequests = resources.map((r) => {
      let pathname;
      try {
        pathname = new URL(r.name, location.origin).pathname;
      } catch {
        pathname = r.name;
      }

      return {
        endpoint: pathname,
        start: Math.round(r.startTime - bootOrigin),
        duration: Math.round(r.duration),
        size: r.transferSize > 0 ? `${(r.transferSize / 1024).toFixed(1)}KB` : "cache",
      };
    });

    const scriptResources = performance.getEntriesByType("resource").filter((r) => {
      return r.initiatorType === "script" || (r.initiatorType === "link" && /\.js(\?|$)/.test(r.name));
    });

    const jsChunks = scriptResources.map((r) => {
      let name;
      try {
        name = new URL(r.name, location.origin).pathname.split("/").pop();
      } catch {
        name = r.name;
      }

      return {
        chunk: name,
        duration: Math.round(r.duration),
        size: r.transferSize > 0 ? `${(r.transferSize / 1024).toFixed(1)}KB` : "cache",
      };
    });

    const nav = performance.getEntriesByType("navigation")[0];

    console.group("%c[RareHunter Admin] Boot Performance Report", "color:#7c3aed;font-weight:bold");

    console.log(
      "%cTimeline",
      "font-weight:bold",
      "\n" +
        `  DNS + TCP + TLS:  ${nav ? Math.round(nav.connectEnd - nav.startTime) + "ms" : "–"}\n` +
        `  Document loaded:  ${nav ? Math.round(nav.domContentLoadedEventEnd) + "ms" : "–"}\n` +
        `  FCP:              ${fcp ? Math.round(fcp.startTime) + "ms" : "–"}\n` +
        `  Shell painted:    ${shellPaint ? Math.round(shellPaint.duration) + "ms" : "–"}\n` +
        `  Data ready (TTI): ${dataReady ? Math.round(dataReady.duration) + "ms" : "–"}`
    );

    console.log(
      "%cAPI Requests (" + apiRequests.length + ")",
      "font-weight:bold"
    );
    if (apiRequests.length) {
      console.table(apiRequests);
    }

    if (jsChunks.length) {
      console.log("%cJS Chunks (" + jsChunks.length + ")", "font-weight:bold");
      console.table(jsChunks);
    }

    const totalApiTime = apiRequests.reduce((sum, r) => sum + r.duration, 0);
    const slowest = apiRequests.length
      ? apiRequests.reduce((a, b) => (a.duration > b.duration ? a : b))
      : null;

    console.log(
      "%cSummary",
      "font-weight:bold",
      "\n" +
        `  Total API time:   ${totalApiTime}ms (${apiRequests.length} requests)\n` +
        `  Slowest request:  ${slowest ? slowest.endpoint + " (" + slowest.duration + "ms)" : "–"}\n` +
        `  Cache hits:       ${apiRequests.filter((r) => r.size === "cache").length}/${apiRequests.length}`
    );

    console.groupEnd();
  } catch (error) {
    console.warn("[RareHunter Admin] Perf report failed:", error);
  }
}
