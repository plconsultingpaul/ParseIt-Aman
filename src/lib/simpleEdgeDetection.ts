export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  corners: Point[] | null;
  confidence: 'high' | 'medium' | 'low';
}

let previousCorners: Point[] | null = null;
const cornerHistory: Point[][] = [];
const maxHistoryLength = 5;

function smoothCorners(newCorners: Point[]): Point[] {
  if (!previousCorners) {
    previousCorners = newCorners;
    cornerHistory.length = 0;
    cornerHistory.push([...newCorners]);
    return newCorners;
  }

  const maxMovement = 30;
  let shouldUpdate = false;

  for (let i = 0; i < 4; i++) {
    const dx = newCorners[i].x - previousCorners[i].x;
    const dy = newCorners[i].y - previousCorners[i].y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxMovement) {
      shouldUpdate = true;
      break;
    }
  }

  if (shouldUpdate) {
    cornerHistory.push([...newCorners]);
    if (cornerHistory.length > maxHistoryLength) {
      cornerHistory.shift();
    }
  }

  if (cornerHistory.length === 0) {
    cornerHistory.push([...newCorners]);
  }

  const smoothed: Point[] = [];
  for (let i = 0; i < 4; i++) {
    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;

    for (let j = 0; j < cornerHistory.length; j++) {
      const weight = (j + 1) / cornerHistory.length;
      sumX += cornerHistory[j][i].x * weight;
      sumY += cornerHistory[j][i].y * weight;
      totalWeight += weight;
    }

    smoothed.push({
      x: Math.round(sumX / totalWeight),
      y: Math.round(sumY / totalWeight)
    });
  }

  previousCorners = smoothed;
  return smoothed;
}

function isValidQuadrilateral(corners: Point[]): boolean {
  if (corners.length !== 4) return false;

  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const p3 = corners[(i + 2) % 4];

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;

    const crossProduct = dx1 * dy2 - dy1 * dx2;

    if (Math.abs(crossProduct) < 100) {
      return false;
    }
  }

  const area = calculatePolygonArea(corners);
  if (area < 1000) return false;

  return true;
}

export function detectDocumentEdges(canvas: HTMLCanvasElement): DetectionResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { corners: null, confidence: 'low' };
  }

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const grayscale = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    grayscale[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const edges = sobelEdgeDetection(grayscale, width, height);

  const corners = findDocumentCorners(edges, width, height);

  if (!corners || corners.length !== 4) {
    return { corners: null, confidence: 'low' };
  }

  if (!isValidQuadrilateral(corners)) {
    return { corners: null, confidence: 'low' };
  }

  const smoothedCorners = smoothCorners(corners);

  const area = calculatePolygonArea(smoothedCorners);
  const totalArea = width * height;
  const areaRatio = area / totalArea;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (areaRatio > 0.20 && areaRatio < 0.80) {
    confidence = 'high';
  } else if (areaRatio > 0.12 && areaRatio < 0.88) {
    confidence = 'medium';
  }

  return { corners: smoothedCorners, confidence };
}

export function resetDetectionState(): void {
  previousCorners = null;
  cornerHistory.length = 0;
}

function gaussianBlur(
  grayscale: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const blurred = new Uint8ClampedArray(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          sum += grayscale[idx] * kernel[kernelIdx];
        }
      }
      blurred[y * width + x] = Math.round(sum / kernelSum);
    }
  }

  return blurred;
}

function sobelEdgeDetection(
  grayscale: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const blurred = gaussianBlur(grayscale, width, height);
  const edges = new Uint8ClampedArray(width * height);

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += blurred[idx] * sobelX[kernelIdx];
          gy += blurred[idx] * sobelY[kernelIdx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = Math.min(255, magnitude);
    }
  }

  return edges;
}

function findDocumentCorners(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): Point[] | null {
  const avgEdgeStrength = calculateAverageEdgeStrength(edges);
  const threshold = Math.max(30, Math.min(50, avgEdgeStrength * 0.4));
  const edgePoints: Point[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) {
        edgePoints.push({ x, y });
      }
    }
  }

  if (edgePoints.length < 4) {
    return null;
  }

  const margin = 20;
  const baseSearchRadius = Math.min(width, height) * 0.35;
  const topSearchRadius = baseSearchRadius * 0.8;
  const bottomSearchRadius = baseSearchRadius * 1.2;

  const topLeft = findClosestPoint(edgePoints, margin, margin, topSearchRadius);
  const topRight = findClosestPoint(edgePoints, width - margin, margin, topSearchRadius);
  const bottomRight = findClosestPoint(edgePoints, width - margin, height - margin, bottomSearchRadius);
  const bottomLeft = findClosestPoint(edgePoints, margin, height - margin, bottomSearchRadius);

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }

  if (!isValidCornerGeometry(topLeft, topRight, bottomRight, bottomLeft, width, height)) {
    return null;
  }

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function findClosestPoint(points: Point[], targetX: number, targetY: number, searchRadius: number): Point | null {
  let closest: Point | null = null;
  let minDistance = Infinity;

  for (const point of points) {
    const dx = point.x - targetX;
    const dy = point.y - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance && distance < searchRadius) {
      minDistance = distance;
      closest = point;
    }
  }

  if (!closest && searchRadius < 600) {
    return findClosestPoint(points, targetX, targetY, searchRadius * 1.5);
  }

  return closest;
}

function calculateAverageEdgeStrength(edges: Uint8ClampedArray): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] > 10) {
      sum += edges[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 50;
}

function isValidCornerGeometry(
  topLeft: Point,
  topRight: Point,
  bottomRight: Point,
  bottomLeft: Point,
  width: number,
  height: number
): boolean {
  const minVerticalDistance = height * 0.15;
  const minHorizontalDistance = width * 0.15;

  if (bottomLeft.y - topLeft.y < minVerticalDistance) return false;
  if (bottomRight.y - topRight.y < minVerticalDistance) return false;

  if (topRight.x - topLeft.x < minHorizontalDistance) return false;
  if (bottomRight.x - bottomLeft.x < minHorizontalDistance) return false;

  if (bottomLeft.x >= bottomRight.x) return false;
  if (topLeft.x >= topRight.x) return false;

  if (bottomLeft.y <= topLeft.y) return false;
  if (bottomRight.y <= topRight.y) return false;

  const topWidth = topRight.x - topLeft.x;
  const bottomWidth = bottomRight.x - bottomLeft.x;
  const widthRatio = Math.max(topWidth, bottomWidth) / Math.min(topWidth, bottomWidth);
  if (widthRatio > 2.5) return false;

  const leftHeight = bottomLeft.y - topLeft.y;
  const rightHeight = bottomRight.y - topRight.y;
  const heightRatio = Math.max(leftHeight, rightHeight) / Math.min(leftHeight, rightHeight);
  if (heightRatio > 2.5) return false;

  return true;
}

function calculatePolygonArea(corners: Point[]): number {
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    area += corners[i].x * corners[j].y;
    area -= corners[j].x * corners[i].y;
  }
  return Math.abs(area / 2);
}

export function drawDetectedEdges(
  canvas: HTMLCanvasElement,
  corners: Point[],
  color: string = '#10b981'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !corners || corners.length !== 4) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.shadowBlur = 0;
  corners.forEach((corner) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
