import { CellState, PuzzleShape, PuzzleColor } from '../types';
import type { GridSize, PlacedPiece, Coord } from '../types';
import { getShapeCells, rotateCells } from './puzzleData';

// Compact binary format for URL sharing:
// version(1B) | gridSize(1B) | gridBitmap(ceil(size²/8)B) | pieceCount(1B) | pieces(2B each)
//
// Each piece: shapeId(4bit) + rotation(2bit) + originX(5bit) + originY(5bit) = 16 bits = 2 bytes
//
// Shape IDs:
// 0=T, 1=Cross, 2=L, 3=Line, 4=Big7Blue, 5=Big7Red, 6=Big7Green, 7=Big7Yellow, 8=Big7Purple
// 9=Wild1, 10=Wild2, 11=Wild3

const SHAPE_TO_ID: Record<string, number> = {
  'T_blue': 0,
  'cross_blue': 1,
  'L_blue': 2,
  'line_blue': 3,
  'big7_blue': 4,
  'big7_red': 5,
  'big7_green': 6,
  'big7_yellow': 7,
  'big7_purple': 8,
  'wild1_gray': 9,
  'wild2_gray': 10,
  'wild3_gray': 11,
  // Also map colored basic shapes to their base (color doesn't matter for shape)
  'T_red': 0, 'T_green': 0, 'T_yellow': 0, 'T_purple': 0,
  'cross_red': 1, 'cross_green': 1, 'cross_yellow': 1, 'cross_purple': 1,
  'L_red': 2, 'L_green': 2, 'L_yellow': 2, 'L_purple': 2,
  'line_red': 3, 'line_green': 3, 'line_yellow': 3, 'line_purple': 3,
};

interface ShapeInfo {
  shape: PuzzleShape;
  color: PuzzleColor;
}

const ID_TO_SHAPE: ShapeInfo[] = [
  { shape: PuzzleShape.T, color: PuzzleColor.Blue },
  { shape: PuzzleShape.Cross, color: PuzzleColor.Blue },
  { shape: PuzzleShape.L, color: PuzzleColor.Blue },
  { shape: PuzzleShape.Line, color: PuzzleColor.Blue },
  { shape: PuzzleShape.Big7, color: PuzzleColor.Blue },
  { shape: PuzzleShape.Big7, color: PuzzleColor.Red },
  { shape: PuzzleShape.Big7, color: PuzzleColor.Green },
  { shape: PuzzleShape.Big7, color: PuzzleColor.Yellow },
  { shape: PuzzleShape.Big7, color: PuzzleColor.Purple },
  { shape: PuzzleShape.Wild1, color: PuzzleColor.Gray },
  { shape: PuzzleShape.Wild2, color: PuzzleColor.Gray },
  { shape: PuzzleShape.Wild3, color: PuzzleColor.Gray },
];

// Base64url encode/decode (URL-safe, no padding)
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeForUrl(gridSize: GridSize, grid: CellState[][], placedPieces: PlacedPiece[]): string {
  const totalCells = gridSize * gridSize;
  const bitmapBytes = Math.ceil(totalCells / 8);

  // Header: version + gridSize + bitmap + pieceCount + pieces
  const pieceCount = Math.min(placedPieces.length, 255);
  const totalBytes = 1 + 1 + bitmapBytes + 1 + pieceCount * 2;
  const buffer = new Uint8Array(totalBytes);

  let offset = 0;
  buffer[offset++] = 1; // version
  buffer[offset++] = gridSize;

  // Grid bitmap: 1 = selected, 0 = unselected
  // Bit order: y=0 x=0 is bit 0 of byte 0
  for (let i = 0; i < totalCells; i++) {
    const y = Math.floor(i / gridSize);
    const x = i % gridSize;
    if (grid[y][x] === CellState.Selected) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      buffer[offset + byteIdx] |= (1 << bitIdx);
    }
  }
  offset += bitmapBytes;

  // Piece count
  buffer[offset++] = pieceCount;

  // Pieces: each 2 bytes
  for (let p = 0; p < pieceCount; p++) {
    const piece = placedPieces[p];
    const key = `${piece.shape}_${piece.color}`;
    const shapeId = SHAPE_TO_ID[key] ?? 0;
    const rotation = piece.rotation % 4;
    const ox = Math.max(0, Math.min(31, piece.origin.x));
    const oy = Math.max(0, Math.min(31, piece.origin.y));

    // Pack: shapeId(4) | rotation(2) | originX(5) | originY(5) = 16 bits
    const word = (shapeId & 0xF) | ((rotation & 0x3) << 4) | ((ox & 0x1F) << 6) | ((oy & 0x1F) << 11);
    buffer[offset++] = word & 0xFF;
    buffer[offset++] = (word >> 8) & 0xFF;
  }

  return toBase64Url(buffer);
}

export function decodeFromUrl(encoded: string): { gridSize: GridSize; grid: CellState[][]; placedPieces: PlacedPiece[] } | null {
  try {
    const buffer = fromBase64Url(encoded);
    if (buffer.length < 3) return null;

    let offset = 0;
    const version = buffer[offset++];
    if (version !== 1) return null;

    const gridSize = buffer[offset++] as GridSize;
    if (![9, 12, 16, 20].includes(gridSize)) return null;

    const totalCells = gridSize * gridSize;
    const bitmapBytes = Math.ceil(totalCells / 8);

    if (buffer.length < offset + bitmapBytes + 1) return null;

    // Decode grid
    const grid: CellState[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => CellState.Unselected)
    );

    for (let i = 0; i < totalCells; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      if (buffer[offset + byteIdx] & (1 << bitIdx)) {
        const y = Math.floor(i / gridSize);
        const x = i % gridSize;
        grid[y][x] = CellState.Selected;
      }
    }
    offset += bitmapBytes;

    // Piece count
    const pieceCount = buffer[offset++];
    if (buffer.length < offset + pieceCount * 2) return null;

    // Decode pieces
    const placedPieces: PlacedPiece[] = [];
    for (let p = 0; p < pieceCount; p++) {
      const lo = buffer[offset++];
      const hi = buffer[offset++];
      const word = lo | (hi << 8);

      const shapeId = word & 0xF;
      const rotation = (word >> 4) & 0x3;
      const ox = (word >> 6) & 0x1F;
      const oy = (word >> 11) & 0x1F;

      if (shapeId >= ID_TO_SHAPE.length) continue;
      const { shape, color } = ID_TO_SHAPE[shapeId];

      const baseCells = getShapeCells(shape, color);
      const rotatedCells = rotateCells(baseCells, rotation);
      const origin: Coord = { x: ox, y: oy };
      const cells = rotatedCells.map(c => ({ x: c.x + origin.x, y: c.y + origin.y }));

      placedPieces.push({
        id: `shared_${p}`,
        pieceId: `${shape}_${color}`,
        shape,
        color,
        cells,
        rotation,
        origin,
      });
    }

    return { gridSize, grid, placedPieces };
  } catch {
    return null;
  }
}
