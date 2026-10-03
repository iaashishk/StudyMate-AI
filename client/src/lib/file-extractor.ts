import * as pdfjsLib from "pdfjs-dist";
import { recognize } from "tesseract.js";

// Configure pdfjs worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface ExtractionProgress {
  stage: "reading" | "ocr" | "done" | "error";
  progress: number; // 0 - 100
  message: string;
}

interface PdfItem {
  str?: string;
  transform?: number[]; // [scaleX, skewY, skewX, scaleY, transX, transY]
  width?: number;
  height?: number;
}

/**
 * Renders a PDF page to a canvas and performs OCR with Tesseract.js
 */
async function ocrPdfPage(
  page: any,
  pageNum: number,
  totalPages: number,
  onProgress?: (p: ExtractionProgress) => void
): Promise<string> {
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/png");

  onProgress?.({
    stage: "ocr",
    progress: Math.round(((pageNum - 1) / totalPages) * 70) + 20,
    message: `Running OCR on page ${pageNum} of ${totalPages}…`,
  });

  const result = await recognize(dataUrl, "eng");
  return result.data.text || "";
}

/**
 * Extract text from a PDF preserving row and column layout.
 * Falls back to OCR if the PDF contains scanned images without text layer.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<string> {
  onProgress?.({ stage: "reading", progress: 10, message: "Loading PDF document…" });

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const pageTexts: string[] = [];
  let totalCharsExtracted = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      stage: "reading",
      progress: Math.round((pageNum / totalPages) * 35) + 10,
      message: `Reading text layer: page ${pageNum} of ${totalPages}…`,
    });

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = (textContent.items || []) as PdfItem[];

    if (items.length === 0) {
      pageTexts.push("");
      continue;
    }

    // Group items into rows based on vertical position (transform[5])
    // Y-coordinates in PDF.js are measured from bottom of page upwards.
    const yTolerance = 6; // items within 6 units share the same line
    const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];

    for (const item of items) {
      const text = item.str || "";
      if (!text.trim()) continue;

      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;

      // Find an existing row within yTolerance
      let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, text });
    }

    // Sort rows from top to bottom (Y descending)
    rows.sort((a, b) => b.y - a.y);

    // Within each row, sort items from left to right (X ascending)
    const formattedLines: string[] = [];
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      // Join row items with tab/pipe spacing to maintain table column separation
      const lineStr = row.items.map((it) => it.text).join(" \t ");
      formattedLines.push(lineStr);
    }

    const pageOutput = formattedLines.join("\n");
    totalCharsExtracted += pageOutput.trim().length;
    pageTexts.push(pageOutput);
  }

  // F20: If text layer has fewer than 80 meaningful characters per page,
  // this is a scanned PDF! Run OCR fallback automatically.
  const avgCharsPerPage = totalCharsExtracted / Math.max(1, totalPages);
  if (avgCharsPerPage < 80) {
    onProgress?.({
      stage: "ocr",
      progress: 20,
      message: "Scanned PDF detected (no text layer) — reading with OCR engine…",
    });

    const ocrTexts: string[] = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const text = await ocrPdfPage(page, pageNum, totalPages, onProgress);
      ocrTexts.push(text);
    }

    onProgress?.({ stage: "done", progress: 100, message: "PDF OCR completed successfully!" });
    return ocrTexts.join("\n\n");
  }

  onProgress?.({ stage: "done", progress: 100, message: "PDF text extracted successfully!" });
  return pageTexts.join("\n\n");
}

/**
 * Extract text from an Image file (PNG, JPG, WebP) using Tesseract.js OCR
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<string> {
  onProgress?.({ stage: "ocr", progress: 5, message: "Initializing OCR engine…" });

  const result = await recognize(file, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const pct = Math.round((m.progress || 0) * 85) + 10;
        onProgress?.({
          stage: "ocr",
          progress: pct,
          message: `Reading text from syllabus image (${pct}%)…`,
        });
      }
    },
  });

  onProgress?.({ stage: "done", progress: 100, message: "Image OCR complete!" });
  return result.data.text || "";
}

/**
 * Auto-detect file type and extract text
 */
export async function extractSyllabusFromFile(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<{ text: string; fileName: string; type: "pdf" | "image" }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

  if (isPdf) {
    const text = await extractTextFromPdf(file, onProgress);
    return { text, fileName: file.name, type: "pdf" };
  }

  if (isImage) {
    const text = await extractTextFromImage(file, onProgress);
    return { text, fileName: file.name, type: "image" };
  }

  throw new Error("Unsupported file format. Please upload a PDF or an Image (PNG, JPG, WebP).");
}
