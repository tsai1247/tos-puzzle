// 場地大小選項
export type GridSize = 9 | 12 | 16 | 20;

// 格子狀態
export const CellState = {
  Empty: 'empty',
  Selected: 'selected',
  Unselected: 'unselected',
} as const;
export type CellState = typeof CellState[keyof typeof CellState];

// 選取工具
export const Tool = {
  SingleSelect: 'single-select',
  SingleDeselect: 'single-deselect',
  RectSelect: 'rect-select',
  RectDeselect: 'rect-deselect',
} as const;
export type Tool = typeof Tool[keyof typeof Tool];

// 拼圖顏色/屬性
export const PuzzleColor = {
  Blue: 'blue',
  Red: 'red',
  Green: 'green',
  Yellow: 'yellow',
  Purple: 'purple',
  Gray: 'gray',
} as const;
export type PuzzleColor = typeof PuzzleColor[keyof typeof PuzzleColor];

// 拼圖形狀類型
export const PuzzleShape = {
  T: 'T',
  Cross: 'cross',
  L: 'L',
  Line: 'line',
  Big7: 'big7',
  Wild1: 'wild1',
  Wild2: 'wild2',
  Wild3: 'wild3',
} as const;
export type PuzzleShape = typeof PuzzleShape[keyof typeof PuzzleShape];

// 坐標
export interface Coord {
  x: number;
  y: number;
}

// 拼圖定義
export interface PuzzlePiece {
  id: string;
  shape: PuzzleShape;
  color: PuzzleColor;
  cells: Coord[];
  rotation: number;
}

// 放置在場地上的拼圖
export interface PlacedPiece {
  id: string;
  pieceId: string;
  shape: PuzzleShape;
  color: PuzzleColor;
  cells: Coord[];
  rotation: number;
  origin: Coord;
}

// 遊戲階段
export const GamePhase = {
  Edit: 'edit',
  Puzzle: 'puzzle',
} as const;
export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

// 自動模式條件
export interface AutoConditions {
  useBasicShapes: boolean;
  useBig7: boolean;
  useBig7Colors: string[];
  useWild: boolean;
  maxWildCells: number;
  requireBig7: boolean;
  requiredBig7Colors: string[];
}

// 自動模式結果
export interface AutoResult {
  pieces: PlacedPiece[];
  wildCellCount: number;
  big7Count: number;
  score: number;
}

// 遊戲狀態
export interface GameState {
  phase: GamePhase;
  gridSize: GridSize;
  grid: CellState[][];
  placedPieces: PlacedPiece[];
  selectedTool: Tool;
  boardName: string;
  autoConditions: AutoConditions;
  autoResults: AutoResult[];
  selectedAutoResult: number | null;
}

// 編碼格式
export interface EncodedData {
  version: number;
  gridSize: GridSize;
  grid: CellState[][];
  placedPieces?: PlacedPiece[];
}
