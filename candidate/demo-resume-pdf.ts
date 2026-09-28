/**
 * DEMO-ONLY PDF writer.
 *
 * The upload/generate/download UI needs a real file to hand back today, before
 * the Python ATS service exists, so this module writes a small, valid PDF
 * in-browser: A4, single column, base-14 Helvetica, plain selectable text.
 *
 * When the ATS service is connected it returns the finished PDF itself and
 * NOTHING in this file is needed any more — delete it and drop the import in
 * `ats-service.ts` (the only place it is used).
 */

export type ResumeBlockKind = 'entry' | 'bullet' | 'text';
export type ResumeAlign = 'left' | 'center' | 'right';

/** Styling a block can carry once it has been through the editor. */
export interface ResumeBlockStyle {
  bold?: boolean;
  italic?: boolean;
  /** Point size. Defaults: 10 for text/bullets, 10.5 for entry rows. */
  size?: number;
  align?: ResumeAlign;
}

export interface ResumeBlock {
  kind: ResumeBlockKind;
  text: string;
  style?: ResumeBlockStyle;
}

export interface ResumeSection {
  title: string;
  blocks: ResumeBlock[];
}

export interface ResumeDocument {
  name: string;
  headline: string;
  contacts: string[];
  sections: ResumeSection[];
}

const PAGE_W = 595; // A4, in points
const PAGE_H = 842;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Average glyph width per font size — good enough for honest line wrapping. */
const AVG_CHAR = 0.5;

function measure(text: string, size: number): number {
  return text.length * size * AVG_CHAR;
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (measure(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

/** PDF strings are ASCII-only: no embedded font, nothing to mis-encode. */
function escapePdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2022\u00B7]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u20B9/g, 'Rs ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

interface Row {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  align: ResumeAlign;
  gapBefore: number;
  /** Draw a hairline under this row (section headings). */
  ruleAfter?: boolean;
  /** Where this row came from — the editor's page markers use these. */
  sectionIndex?: number;
  blockIndex?: number;
}

function rowsFor(document: ResumeDocument): Row[] {
  const rows: Row[] = [];
  const push = (row: Row) => rows.push({ ...row, text: escapePdfText(row.text) });

  push({ text: document.name, size: 17, bold: true, italic: false, align: 'center', gapBefore: 0 });
  if (document.headline) {
    push({
      text: document.headline,
      size: 10.5,
      bold: false,
      italic: false,
      align: 'center',
      gapBefore: 5,
    });
  }
  if (document.contacts.length) {
    push({
      text: document.contacts.join(' | '),
      size: 9.5,
      bold: false,
      italic: false,
      align: 'center',
      gapBefore: 3,
    });
  }

  document.sections.forEach((section, sectionIndex) => {
    push({
      text: section.title.toUpperCase(),
      size: 10.5,
      bold: true,
      italic: false,
      align: 'left',
      gapBefore: 14,
      ruleAfter: true,
    });

    section.blocks.forEach((block, blockIndex) => {
      const style = block.style ?? {};
      const isEntry = block.kind === 'entry';
      const size = style.size ?? (isEntry ? 10.5 : 10);
      const bold = style.bold ?? isEntry;
      const italic = style.italic ?? false;
      const align = style.align ?? 'left';

      const isBullet = block.kind === 'bullet';
      const prefix = isBullet ? '- ' : '';
      const width = CONTENT_W - (isBullet ? prefix.length * 5 : 0);
      const gap = isEntry ? 7 : isBullet ? 2 : 3;

      /* The editor stores soft breaks as newlines; each one starts a new row. */
      let firstRow = true;
      for (const segment of block.text.split('\n')) {
        for (const line of wrap(segment, size, width)) {
          push({
            text: firstRow && isBullet ? `${prefix}${line}` : line,
            size,
            bold,
            italic,
            align,
            gapBefore: firstRow ? gap : 0,
            sectionIndex,
            blockIndex,
          });
          firstRow = false;
        }
      }
    });
  });

  return rows;
}

/** A page after the first, and the block whose content starts it. */
export interface ResumePageBreak {
  /** 1-based page number. */
  page: number;
  sectionIndex: number;
  blockIndex: number;
  /**
   * True when the block itself began on the previous page and only continues
   * here (a long paragraph) — the editor words its marker differently then.
   */
  insideBlock: boolean;
}

/**
 * Row layout and pagination — the single source of truth for both the PDF and
 * the editor's page markers, so the two can never disagree.
 */
function layout(document: ResumeDocument): { pages: string[]; breaks: ResumePageBreak[] } {
  const pages: string[] = [];
  const breaks: ResumePageBreak[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  let previous: Row | null = null;
  /* A page can also begin with a section heading, which belongs to no block —
     the marker then attaches to that section's first line. */
  let pendingBreakPage: number | null = null;

  const flush = () => {
    pages.push(ops.join('\n'));
    ops = [];
    y = PAGE_H - MARGIN;
  };

  for (const row of rowsFor(document)) {
    const leading = row.size * 1.4;
    y -= row.gapBefore;
    if (y - leading < MARGIN) {
      /* Every page after the first starts with some row — record whose it is so
         the editor can put its marker on the right line. */
      const continues =
        previous !== null &&
        previous.sectionIndex === row.sectionIndex &&
        previous.blockIndex === row.blockIndex;
      flush();
      const startedPage = pages.length + 1; /* the page this row goes on */
      if (row.sectionIndex !== undefined && row.blockIndex !== undefined) {
        breaks.push({
          page: startedPage,
          sectionIndex: row.sectionIndex,
          blockIndex: row.blockIndex,
          insideBlock: continues,
        });
        pendingBreakPage = null;
      } else {
        pendingBreakPage = startedPage;
      }
    }

    /* The heading that opened the page was followed by its first line. */
    if (pendingBreakPage !== null && row.sectionIndex !== undefined && row.blockIndex !== undefined) {
      breaks.push({
        page: pendingBreakPage,
        sectionIndex: row.sectionIndex,
        blockIndex: row.blockIndex,
        insideBlock: false,
      });
      pendingBreakPage = null;
    }

    if (row.text) {
      const width = measure(row.text, row.size);
      const x =
        row.align === 'center'
          ? MARGIN + Math.max((CONTENT_W - width) / 2, 0)
          : row.align === 'right'
            ? MARGIN + Math.max(CONTENT_W - width, 0)
            : MARGIN;
      const font = row.bold ? (row.italic ? 'F4' : 'F2') : row.italic ? 'F3' : 'F1';
      ops.push(
        `BT /${font} ${row.size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(
          2,
        )} Tm (${row.text}) Tj ET`,
      );
      y -= leading;
    } else {
      y -= leading;
    }

    if (row.ruleAfter) {
      ops.push(`0.75 G 0.7 w ${MARGIN} ${y.toFixed(2)} m ${PAGE_W - MARGIN} ${y.toFixed(2)} l S`);
      y -= 6;
    }

    previous = row;
  }

  flush();
  return { pages: pages.length ? pages : [''], breaks };
}

/**
 * Where the generated PDF breaks onto a new page, as `sectionIndex` +
 * `blockIndex` of the document's blocks. The editor draws its
 * "Page 2 starts here" markers from this, so a marker always matches the PDF.
 */
export function resumePageBreaks(document: ResumeDocument): ResumePageBreak[] {
  return layout(document).breaks;
}

/** " | " joined plain text — the most parser-proof export there is. */
export function resumePlainText(document: ResumeDocument): string {
  const lines: string[] = [document.name];
  if (document.headline) lines.push(document.headline);
  if (document.contacts.length) lines.push(document.contacts.join(' | '));
  for (const section of document.sections) {
    lines.push('', section.title.toUpperCase());
    for (const block of section.blocks) {
      lines.push(block.kind === 'bullet' ? `- ${block.text}` : block.text);
    }
  }
  return lines.join('\n').trim();
}

/** Builds the PDF bytes. Returns the blob plus the page count for the UI. */
export function resumePdf(document: ResumeDocument): { blob: Blob; pages: number } {
  const { pages } = layout(document);
  const pageIds = pages.map((_, index) => 3 + index * 2);
  /* Only declare the faces the document actually uses, so a resume without
     styling produces exactly the same file it did before the editor existed. */
  const usedFonts = new Set<string>();
  for (const content of pages) {
    for (const match of content.matchAll(/BT \/(F[1-4])/g)) usedFonts.add(match[1]);
  }
  if (!usedFonts.size) usedFonts.add('F1');

  const fontIds: Record<string, number> = {};
  let nextFontId = 3 + pages.length * 2;
  for (const key of ['F1', 'F2', 'F3', 'F4']) {
    if (usedFonts.has(key)) {
      fontIds[key] = nextFontId;
      nextFontId += 1;
    }
  }
  const fontResources = Object.entries(fontIds)
    .map(([key, id]) => `/${key} ${id} 0 R`)
    .join(' ');

  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    {
      id: 2,
      body: `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds
        .map((id) => `${id} 0 R`)
        .join(' ')}] >>`,
    },
  ];

  pages.forEach((content, index) => {
    const pageId = pageIds[index];
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << ${fontResources} >> >> /Contents ${
        pageId + 1
      } 0 R >>`,
    });
    objects.push({
      id: pageId + 1,
      body: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    });
  });

  const FONT_FACES: Record<string, string> = {
    F1: 'Helvetica',
    F2: 'Helvetica-Bold',
    F3: 'Helvetica-Oblique',
    F4: 'Helvetica-BoldOblique',
  };
  for (const [key, id] of Object.entries(fontIds)) {
    objects.push({
      id,
      body: `<< /Type /Font /Subtype /Type1 /BaseFont ${FONT_FACES[key]} /Encoding /WinAnsiEncoding >>`,
    });
  }

  objects.sort((a, b) => a.id - b.id);

  const encoder = new TextEncoder();
  const bytes = (value: string) => encoder.encode(value).length;

  let pdf = '%PDF-1.4\n';
  const offsets: Record<number, number> = {};
  for (const object of objects) {
    offsets[object.id] = bytes(pdf);
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const startxref = bytes(pdf);
  const size = objects.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const object of objects) {
    xref += `${String(offsets[object.id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `${xref}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return { blob: new Blob([pdf], { type: 'application/pdf' }), pages: pages.length };
}
