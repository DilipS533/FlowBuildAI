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
      const text = item.str.trim();

      // Skip purely numeric or whitespace-only items
      if (!text || /^\d+$/.test(text)) {
        return;
      }

      if (lastY !== null && Math.abs(nextY - lastY) > 3) {
        pageText += "\n";
      }

      pageText += `${text} `;
      lastY = nextY;
    });

    pages.push(pageText.trim());
  }

  // Clean up the extracted text
  let cleanText = pages.join("\n");
  
  // Remove excessive whitespace
  cleanText = cleanText.replace(/\s+/g, " ");
  
  // Fix spacing around punctuation
  cleanText = cleanText.replace(/\s+([.!?,;:])/g, "$1");
  
  // Restore line breaks for readability
  cleanText = cleanText.replace(/([.!?])\s+(?=[A-Z])/g, "$1\n");
  
  return cleanText.trim();
}
