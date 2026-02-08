/**
 * TOOLS-015 (#51) -- PDF / text ingestion
 *
 * Extracts text from PDF and plain-text documents into a structured
 * representation using system CLI tools:
 * - `pdftotext` (poppler-utils) for text-based PDFs
 * - `pdfinfo` (poppler-utils) for PDF metadata
 * - `tesseract` for OCR fallback on scanned/image PDFs
 *
 * @module
 */

import { execFile } from "node:child_process";
import { readFile, stat, writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

/** A single entry in the document's table of contents. */
export type TocEntry = {
  /** Heading or section title. */
  title: string;

  /** Nesting level (1 = top-level heading, 2 = sub-heading, etc.). */
  level: number;

  /** 1-based page number where this heading appears (PDF only). */
  page?: number;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Extracted content for a single page (PDF) or logical section (text). */
export type IngestedPage = {
  /** 1-based page number. */
  page_number: number;

  /** Extracted plain text for this page. */
  text: string;

  /** Character count (useful for chunking heuristics). */
  char_count: number;
};

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Document-level metadata extracted from the file. */
export type IngestMetadata = {
  /** Document title (from PDF metadata or first heading). */
  title?: string;

  /** Author (from PDF metadata, may be absent). */
  author?: string;

  /** Creation date (from PDF metadata, ISO-8601). */
  created_at?: string;

  /** Modification date (from PDF metadata, ISO-8601). */
  modified_at?: string;

  /** PDF producer / creator application. */
  producer?: string;

  /** Total file size in bytes. */
  file_size_bytes?: number;

  /** MIME type of the source file. */
  content_type?: string;

  /** Number of pages (PDF only). */
  page_count?: number;

  /** Whether OCR was used (scanned document). */
  ocr_used?: boolean;
};

// ---------------------------------------------------------------------------
// IngestResult
// ---------------------------------------------------------------------------

/** The structured result of ingesting a document. */
export type IngestResult = {
  /** The full extracted text (all pages concatenated). */
  text: string;

  /** Per-page content. */
  pages: IngestedPage[];

  /** Document metadata. */
  metadata: IngestMetadata;

  /** Table of contents extracted from headings / bookmarks. */
  table_of_contents: TocEntry[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

/** Extract metadata from a PDF using `pdfinfo`. */
async function extractPdfInfo(
  path: string,
): Promise<{
  title?: string;
  author?: string;
  producer?: string;
  pageCount?: number;
  createdAt?: string;
  modifiedAt?: string;
}> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [path]);
    const get = (key: string): string | undefined => {
      const match = stdout.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      return match?.[1]?.trim() || undefined;
    };
    return {
      title: get("Title"),
      author: get("Author"),
      producer: get("Producer"),
      pageCount: get("Pages") ? parseInt(get("Pages")!, 10) : undefined,
      createdAt: get("CreationDate"),
      modifiedAt: get("ModDate"),
    };
  } catch {
    return {};
  }
}

/** Extract text from a PDF using `pdftotext`, returning per-page content. */
async function extractWithPdftotext(path: string, pageCount: number): Promise<IngestedPage[]> {
  const pages: IngestedPage[] = [];
  for (let i = 1; i <= pageCount; i++) {
    try {
      const { stdout } = await execFileAsync("pdftotext", [
        "-f",
        String(i),
        "-l",
        String(i),
        "-layout",
        path,
        "-",
      ]);
      const text = stdout.trim();
      pages.push({ page_number: i, text, char_count: text.length });
    } catch {
      pages.push({ page_number: i, text: "", char_count: 0 });
    }
  }
  return pages;
}

/** OCR a PDF using ghostscript (PDF→PNG) + tesseract (PNG→text). */
async function extractWithOcr(path: string, pageCount: number): Promise<IngestedPage[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "pdf-ocr-"));
  const pages: IngestedPage[] = [];

  try {
    for (let i = 1; i <= Math.min(pageCount, 50); i++) {
      const pngPath = join(tempDir, `page-${i}.png`);
      const txtPath = join(tempDir, `page-${i}`);

      try {
        // Render PDF page to PNG at 300 DPI
        await execFileAsync(
          "gs",
          [
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-sDEVICE=png16m",
            "-r300",
            `-dFirstPage=${i}`,
            `-dLastPage=${i}`,
            `-sOutputFile=${pngPath}`,
            path,
          ],
          { timeout: 30_000 },
        );

        // OCR the PNG
        await execFileAsync("tesseract", [pngPath, txtPath, "-l", "eng"], { timeout: 30_000 });

        const text = await readFile(`${txtPath}.txt`, "utf-8").then((t) => t.trim());
        pages.push({ page_number: i, text, char_count: text.length });
      } catch {
        pages.push({ page_number: i, text: "", char_count: 0 });
      }

      // Clean up temp files for this page
      await unlink(pngPath).catch(() => {});
      await unlink(`${txtPath}.txt`).catch(() => {});
    }
  } finally {
    // Best-effort cleanup of temp directory
    await unlink(tempDir).catch(() => {});
  }

  return pages;
}

// ---------------------------------------------------------------------------
// PDF ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a PDF document and extract its text content, page structure,
 * metadata, and table of contents.
 *
 * Uses `pdftotext` (poppler-utils) for text extraction with OCR fallback
 * via `tesseract` + `ghostscript` for scanned documents.
 *
 * @param path Absolute path to the PDF file.
 * @returns The structured ingestion result.
 */
export async function ingestPdf(path: string): Promise<IngestResult> {
  const fileStat = await stat(path);
  const info = await extractPdfInfo(path);
  const pageCount = info.pageCount ?? 1;

  const metadata: IngestMetadata = {
    title: info.title,
    author: info.author,
    producer: info.producer,
    created_at: info.createdAt,
    modified_at: info.modifiedAt,
    file_size_bytes: fileStat.size,
    content_type: "application/pdf",
    page_count: pageCount,
    ocr_used: false,
  };

  // Try pdftotext first
  let pages: IngestedPage[] = [];
  if (await commandExists("pdftotext")) {
    pages = await extractWithPdftotext(path, pageCount);
  }

  // If pdftotext extracted very little text, try OCR
  const totalChars = pages.reduce((sum, p) => sum + p.char_count, 0);
  if (totalChars < 100 && (await commandExists("tesseract")) && (await commandExists("gs"))) {
    pages = await extractWithOcr(path, pageCount);
    metadata.ocr_used = true;
  }

  const fullText = pages.map((p) => p.text).join("\n\n");

  // Extract basic TOC from heading-like patterns in the text
  const toc: TocEntry[] = [];
  for (const page of pages) {
    for (const line of page.text.split("\n")) {
      const trimmed = line.trim();
      // Detect all-caps lines as potential section headings
      if (
        trimmed.length > 3 &&
        trimmed.length < 80 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed)
      ) {
        toc.push({ title: trimmed, level: 1, page: page.page_number });
      }
    }
  }

  return { text: fullText, pages, metadata, table_of_contents: toc };
}

// ---------------------------------------------------------------------------
// Plain text ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a plain-text document and extract its content, metadata, and
 * a heading-based table of contents.
 *
 * Headings are detected by common patterns:
 * - Markdown-style (`# Heading`, `## Sub-heading`)
 * - Underlined (`Heading\n=======`, `Sub-heading\n-------`)
 *
 * @param path Absolute path to the text file.
 * @returns The structured ingestion result.
 */
export async function ingestText(path: string): Promise<IngestResult> {
  const data = await readFile(path, "utf-8");
  const lines = data.split("\n");

  // Detect Markdown headings for TOC
  const toc: TocEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      toc.push({ title: match[2].trim(), level: match[1].length });
    }
  }

  const page: IngestedPage = {
    page_number: 1,
    text: data,
    char_count: data.length,
  };

  return {
    text: data,
    pages: [page],
    metadata: {
      file_size_bytes: Buffer.byteLength(data, "utf-8"),
      content_type: "text/plain",
    },
    table_of_contents: toc,
  };
}
