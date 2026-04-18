let pdfModulePromise = null;

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import("pdfjs-dist");
  }

  const pdfModule = await pdfModulePromise;
  pdfModule.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  return pdfModule;
}

export async function extractTextFromPdf(file) {
  const { getDocument } = await loadPdfModule();
  const arrayBuffer = await file.arrayBuffer();
  const documentProxy = await getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= documentProxy.numPages; pageIndex += 1) {
    const page = await documentProxy.getPage(pageIndex);
    const content = await page.getTextContent();
    let pageText = "";
    let lastY = null;

    content.items.forEach((item) => {
      const nextY = item.transform[5];

      if (lastY !== null && Math.abs(nextY - lastY) > 3) {
        pageText += "\n";
      }

      pageText += `${item.str} `;
      lastY = nextY;
    });

    pages.push(pageText.trim());
  }

  return pages.join("\n");
}
