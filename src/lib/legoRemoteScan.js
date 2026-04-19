/**
 * Optional remote LEGO scan (Brickit does not publish a web API).
 * Point VITE_LEGO_SCAN_URL at your own service that accepts POST multipart field "image"
 * and returns JSON this module can normalize.
 */

function normalizePayload(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const verdict =
    typeof data.verdict === "string"
      ? data.verdict.toLowerCase()
      : typeof data.status === "string"
        ? data.status.toLowerCase()
        : null;

  const brickCount =
    typeof data.brickCount === "number"
      ? data.brickCount
      : typeof data.bricks === "number"
        ? data.bricks
        : Array.isArray(data.pieces)
          ? data.pieces.length
          : typeof data.detected === "number"
            ? data.detected
            : null;

  const hint =
    typeof data.hint === "string"
      ? data.hint
      : typeof data.message === "string"
        ? data.message
        : typeof data.detail === "string"
          ? data.detail
          : "";

  if (
    verdict !== "ok" &&
    verdict !== "mismatch" &&
    verdict !== "unknown" &&
    brickCount === null &&
    !hint
  ) {
    return null;
  }

  return {
    verdict:
      verdict === "ok" || verdict === "mismatch" || verdict === "unknown"
        ? verdict
        : "unknown",
    brickCount,
    hint,
    raw: data,
  };
}

export function getLegoScanEndpoint() {
  const url = import.meta.env?.VITE_LEGO_SCAN_URL;
  return typeof url === "string" && url.trim().length ? url.trim() : "";
}

/**
 * @param {HTMLCanvasElement | null} canvas
 * @returns {Promise<null | ReturnType<typeof normalizePayload>>}
 */
export function fetchLegoRemoteScan(canvas) {
  const endpoint = getLegoScanEndpoint();
  if (!endpoint || !canvas?.toBlob) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }

        const form = new FormData();
        form.append("image", blob, "workspace.jpg");

        const headers = {};
        const key = import.meta.env?.VITE_LEGO_SCAN_KEY;
        if (typeof key === "string" && key.trim()) {
          headers.Authorization = `Bearer ${key.trim()}`;
        }

        try {
          const response = await fetch(endpoint, {
            method: "POST",
            body: form,
            headers,
          });

          if (!response.ok) {
            resolve(null);
            return;
          }

          const data = await response.json();
          resolve(normalizePayload(data));
        } catch {
          resolve(null);
        }
      },
      "image/jpeg",
      0.74
    );
  });
}
