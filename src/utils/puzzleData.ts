import { PuzzleColor, PuzzleShape } from '../types';
import type { Coord } from '../types';

// 基本形狀定義（原始座標）
export const SHAPE_DEFINITIONS: Record<PuzzleShape, Coord[]> = {
  [PuzzleShape.T]: [
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
    { x: 1, y: 1 }, { x: 1, y: 0 },
  ],
  [PuzzleShape.Cross]: [
    { x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 },
    { x: 1, y: 1 }, { x: 1, y: 0 },
  ],
  [PuzzleShape.L]: [
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 2 }, { x: 2, y: 2 },
  ],
  [PuzzleShape.Line]: [
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
  ],
  [PuzzleShape.Big7]: [], // 由顏色決定
  [PuzzleShape.Wild1]: [{ x: 0, y: 0 }],
  [PuzzleShape.Wild2]: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  [PuzzleShape.Wild3]: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
};

// 大型7格拼圖定義（依顏色）
export const BIG7_DEFINITIONS: Record<string, Coord[]> = {
  [PuzzleColor.Blue]: [
    { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
    { x: 0, y: 3 }, { x: 2, y: 3 },
  ],
  [PuzzleColor.Red]: [
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 1 }, { x: 1, y: 2 },
    { x: 2, y: 2 }, { x: 3, y: 2 },
  ],
  [PuzzleColor.Green]: [
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 1 },
    { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
  ],
  [PuzzleColor.Yellow]: [
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
  ],
  [PuzzleColor.Purple]: [
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
    { x: 2, y: 0 },
  ],
};

// 取得拼圖的形狀座標
export function getShapeCells(shape: PuzzleShape, color?: PuzzleColor): Coord[] {
  if (shape === PuzzleShape.Big7 && color) {
    return BIG7_DEFINITIONS[color] || [];
  }
  return SHAPE_DEFINITIONS[shape];
}

// 旋轉座標（以原點為中心，順時針旋轉90度）
export function rotateCoord(coord: Coord, times: number): Coord {
  let { x, y } = coord;
  for (let i = 0; i < (times % 4); i++) {
    const newX = y;
    const newY = -x;
    x = newX;
    y = newY;
  }
  return { x, y };
}

// 旋轉一組座標並正規化（使最小x, y 為0）
export function rotateCells(cells: Coord[], times: number): Coord[] {
  const rotated = cells.map(c => rotateCoord(c, times));
  const minX = Math.min(...rotated.map(c => c.x));
  const minY = Math.min(...rotated.map(c => c.y));
  return rotated.map(c => ({ x: c.x - minX, y: c.y - minY }));
}

// 將相對座標轉為絕對座標
export function cellsToAbsolute(cells: Coord[], origin: Coord): Coord[] {
  return cells.map(c => ({ x: c.x + origin.x, y: c.y + origin.y }));
}

// 顏色對應的 CSS 顏色
export const COLOR_MAP: Record<PuzzleColor, string> = {
  [PuzzleColor.Blue]: '#4a90d9',
  [PuzzleColor.Red]: '#d94a4a',
  [PuzzleColor.Green]: '#4ad94a',
  [PuzzleColor.Yellow]: '#d9d94a',
  [PuzzleColor.Purple]: '#9b4ad9',
  [PuzzleColor.Gray]: '#999999',
};

// 顏色對應的邊框 CSS 顏色
export const BORDER_COLOR_MAP: Record<PuzzleColor, string> = {
  [PuzzleColor.Blue]: '#2a5a9a',
  [PuzzleColor.Red]: '#9a2a2a',
  [PuzzleColor.Green]: '#2a9a2a',
  [PuzzleColor.Yellow]: '#9a9a2a',
  [PuzzleColor.Purple]: '#6a2a9a',
  [PuzzleColor.Gray]: '#666666',
};

// 生成唯一 ID
let idCounter = 0;
export function generateId(): string {
  return `piece_${Date.now()}_${idCounter++}`;
}

// 基本形狀列表（自動模式中使用）
export const BASIC_SHAPES: PuzzleShape[] = [
  PuzzleShape.T,
  PuzzleShape.Cross,
  PuzzleShape.L,
  PuzzleShape.Line,
];

// 萬能拼圖列表
export const WILD_SHAPES: PuzzleShape[] = [
  PuzzleShape.Wild1,
  PuzzleShape.Wild2,
  PuzzleShape.Wild3,
];
