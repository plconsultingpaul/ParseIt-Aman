import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PdfPositionedText = PdfTextItem[][];

export async function extractPositionedText(pdfFile: File | Blob): Promise<PdfPositionedText> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: PdfPositionedText = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of textContent.items as any[]) {
      const tx = raw.transform;
      if (!tx) continue;
      const x = tx[4];
      const yPdf = tx[5];
      const height = raw.height || tx[3] || 10;
      const y = viewport.height - yPdf - height;
      const width = raw.width || 0;
      const str = (raw.str || '').toString();
      if (str.length === 0) continue;
      items.push({ str, x, y, width, height });
    }
    pages.push(items);
  }
  return pages;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface LabelMatch {
  startIdx: number;
  endIdx: number;
  startX: number;
  endX: number;
  y: number;
  height: number;
  matchedText: string;
}

const MAX_LABEL_WINDOW = 16;

function findLabelMatch(items: PdfTextItem[], label: string): LabelMatch | null {
  const target = normalize(label);
  if (!target) return null;
  for (let i = 0; i < items.length; i++) {
    let norm = '';
    const ranges: Array<{ charStart: number; charEnd: number; itemIdx: number }> = [];
    for (let j = i; j < Math.min(items.length, i + MAX_LABEL_WINDOW); j++) {
      const piece = normalize(items[j].str);
      if (piece.length === 0) {
        ranges.push({ charStart: norm.length, charEnd: norm.length, itemIdx: j });
        continue;
      }
      if (norm.length > 0) norm += ' ';
      const charStart = norm.length;
      norm += piece;
      const charEnd = norm.length;
      ranges.push({ charStart, charEnd, itemIdx: j });

      if (norm.length < target.length) {
        if (norm.length > target.length + 80) break;
        continue;
      }
      const matchCharStart = norm.indexOf(target);
      if (matchCharStart !== -1) {
        const matchCharEnd = matchCharStart + target.length;
        const contributors = ranges.filter(r =>
          r.charEnd > matchCharStart && r.charStart < matchCharEnd && r.charEnd > r.charStart
        );
        if (contributors.length === 0) {
          if (norm.length > target.length + 80) break;
          continue;
        }
        const firstIdx = contributors[0].itemIdx;
        const lastIdx = contributors[contributors.length - 1].itemIdx;
        const matched = items.slice(firstIdx, lastIdx + 1);
        return {
          startIdx: firstIdx,
          endIdx: lastIdx,
          startX: Math.min(...matched.map(it => it.x)),
          endX: Math.max(...matched.map(it => it.x + it.width)),
          y: items[firstIdx].y,
          height: items[firstIdx].height,
          matchedText: matched.map(it => it.str).join(' ')
        };
      }
      if (norm.length > target.length + 80) break;
    }
  }
  return null;
}

const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;

function isJunk(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return true;
  return PUNCT_ONLY.test(trimmed);
}

function clusterRows(items: Array<{ it: PdfTextItem; idx: number }>, rowEpsilon: number): Array<Array<{ it: PdfTextItem; idx: number }>> {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.it.y - b.it.y || a.it.x - b.it.x);
  const rows: Array<Array<{ it: PdfTextItem; idx: number }>> = [];
  let currentRow: Array<{ it: PdfTextItem; idx: number }> = [sorted[0]];
  let currentY = sorted[0].it.y;
  for (let k = 1; k < sorted.length; k++) {
    const entry = sorted[k];
    if (Math.abs(entry.it.y - currentY) <= rowEpsilon) {
      currentRow.push(entry);
    } else {
      rows.push(currentRow);
      currentRow = [entry];
      currentY = entry.it.y;
    }
  }
  rows.push(currentRow);
  return rows;
}

export interface AnchorResolveOptions {
  label: string;
  direction: 'right' | 'below';
  columnTolerance: number;
}

export interface AnchorResolveResult {
  matched: boolean;
  value: string;
  reason?: string;
  debug: {
    page: number;
    labelMatchAt?: { startX: number; endX: number; y: number; matchedText: string };
    rowsConsidered?: Array<{ y: number; tokens: Array<{ str: string; x: number }>; reason: string }>;
    selectedRow?: { y: number; tokens: Array<{ str: string; x: number }> };
  };
}

export function resolveAnchorValue(
  pages: PdfPositionedText,
  options: AnchorResolveOptions
): AnchorResolveResult {
  const tol = options.columnTolerance > 0 ? options.columnTolerance : 25;
  for (let p = 0; p < pages.length; p++) {
    const items = pages[p];
    const match = findLabelMatch(items, options.label);
    if (!match) continue;

    const labelLeft = match.startX;
    const labelRight = match.endX;
    const colMin = labelLeft - tol;
    const colMax = labelRight + tol;
    const rowEpsilon = Math.max(match.height * 0.7, 4);
    const rightRowEpsilon = Math.max(match.height * 1.5, 6);
    const belowMaxDy = Math.max(match.height * 3.5, 24);

    const debug: AnchorResolveResult['debug'] = {
      page: p + 1,
      labelMatchAt: { startX: labelLeft, endX: labelRight, y: match.y, matchedText: match.matchedText },
      rowsConsidered: []
    };

    if (options.direction === 'right') {
      let rowItems = items
        .map((it, idx) => ({ it, idx }))
        .filter(({ it, idx }) => idx > match.endIdx && Math.abs(it.y - match.y) <= rowEpsilon && it.x >= labelRight - 2);
      if (rowItems.length === 0) {
        rowItems = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it, idx }) =>
            idx > match.endIdx &&
            Math.abs(it.y - match.y) <= rightRowEpsilon &&
            it.x >= labelRight - 2 &&
            it.x - labelRight <= Math.max(match.height * 30, 300)
          );
      }
      const sorted = rowItems.sort((a, b) => a.it.x - b.it.x);
      const accepted: Array<{ it: PdfTextItem; idx: number }> = [];
      let prevRight = labelRight;
      for (const entry of sorted) {
        if (accepted.length === 0 && isJunk(entry.it.str)) continue;
        const gap = entry.it.x - prevRight;
        if (accepted.length > 0 && gap > Math.max(rowEpsilon * 4, 60)) break;
        accepted.push(entry);
        prevRight = entry.it.x + entry.it.width;
      }
      const value = accepted.map(e => e.it.str.trim()).join(' ').trim();
      debug.selectedRow = accepted.length
        ? { y: accepted[0].it.y, tokens: accepted.map(e => ({ str: e.it.str, x: e.it.x })) }
        : undefined;
      if (!value) {
        return { matched: false, value: '', reason: 'no-token-right-of-label', debug };
      }
      return { matched: true, value, debug };
    }

    const belowAll = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it, idx }) => idx > match.endIdx && it.y > match.y + match.height * 0.5);
    const rows = clusterRows(belowAll, rowEpsilon);

    for (const row of rows) {
      const rowY = row[0].it.y;
      if (rowY - match.y > belowMaxDy) {
        debug.rowsConsidered!.push({
          y: rowY,
          tokens: row.map(e => ({ str: e.it.str, x: e.it.x })),
          reason: 'beyond-vertical-cap'
        });
        break;
      }
      const inColumn = row.filter(({ it }) => {
        const center = it.x + it.width / 2;
        return center >= colMin && center <= colMax;
      }).sort((a, b) => a.it.x - b.it.x);

      const rowSummary = {
        y: row[0].it.y,
        tokens: row.map(e => ({ str: e.it.str, x: e.it.x })),
        reason: ''
      };

      if (inColumn.length === 0) {
        rowSummary.reason = 'no-tokens-in-column';
        debug.rowsConsidered!.push(rowSummary);
        continue;
      }

      const meaningful = inColumn.filter(({ it }) => !isJunk(it.str));
      if (meaningful.length === 0) {
        rowSummary.reason = 'only-junk-in-column';
        debug.rowsConsidered!.push(rowSummary);
        continue;
      }

      rowSummary.reason = 'selected';
      debug.rowsConsidered!.push(rowSummary);
      const value = meaningful.map(e => e.it.str.trim()).join(' ').trim();
      debug.selectedRow = { y: meaningful[0].it.y, tokens: meaningful.map(e => ({ str: e.it.str, x: e.it.x })) };
      return { matched: true, value, debug };
    }

    return { matched: false, value: '', reason: 'no-row-below-in-column', debug };
  }
  return {
    matched: false,
    value: '',
    reason: 'label-not-found',
    debug: { page: 0 }
  };
}

export interface RectCoords {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export function parseCoordinateString(raw: string): RectCoords | null {
  if (!raw) return null;
  const numMatch = raw.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (!numMatch) return null;
  const pageMatch = raw.match(/page\s+(\d+)/i);
  return {
    x: parseFloat(numMatch[1]),
    y: parseFloat(numMatch[2]),
    width: parseFloat(numMatch[3]),
    height: parseFloat(numMatch[4]),
    page: pageMatch ? parseInt(pageMatch[1], 10) : 1,
  };
}

export interface RectResolveResult {
  matched: boolean;
  value: string;
  reason?: string;
  debug: {
    page: number;
    rect?: RectCoords;
    itemsInside?: Array<{ str: string; x: number; y: number }>;
  };
}

export function resolveRectValue(
  pages: PdfPositionedText,
  rect: RectCoords
): RectResolveResult {
  const pageIdx = Math.max(0, rect.page - 1);
  if (pageIdx >= pages.length) {
    return { matched: false, value: '', reason: 'page-out-of-range', debug: { page: rect.page, rect } };
  }
  const items = pages[pageIdx];
  const xMin = rect.x;
  const xMax = rect.x + rect.width;
  const yMin = rect.y;
  const yMax = rect.y + rect.height;

  const inside = items.filter(it => {
    const cx = it.x + it.width / 2;
    const cy = it.y + it.height / 2;
    return cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax;
  });

  if (inside.length === 0) {
    return {
      matched: false,
      value: '',
      reason: 'no-tokens-in-rect',
      debug: { page: rect.page, rect, itemsInside: [] },
    };
  }

  const sorted = [...inside].sort((a, b) => {
    const rowEps = Math.max(a.height, b.height) * 0.6;
    if (Math.abs(a.y - b.y) > rowEps) return a.y - b.y;
    return a.x - b.x;
  });

  const value = sorted
    .map(it => it.str.trim())
    .filter(s => s.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    matched: value.length > 0,
    value,
    reason: value.length > 0 ? 'ok' : 'only-whitespace',
    debug: {
      page: rect.page,
      rect,
      itemsInside: sorted.map(it => ({ str: it.str, x: it.x, y: it.y })),
    },
  };
}
