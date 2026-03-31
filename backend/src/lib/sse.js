/**
 * SSE stub — not compatible with Vercel Serverless.
 *
 * Returns 501 with a clear message so frontend can fall back to polling.
 */

function sseUnavailable(_req, res) {
  res.status(501).json({
    error: "SSE not available in serverless mode",
    code: "SSE_UNAVAILABLE",
  });
}

export const publicSSEHandler = sseUnavailable;
export const adminSSEHandler = sseUnavailable;
