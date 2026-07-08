import { CellState, PuzzleColor, PuzzleShape } from '../types';
import type { Coord, PlacedPiece, AutoConditions, AutoResult } from '../types';
import { getShapeCells, rotateCells, generateId, BASIC_SHAPES, WILD_SHAPES } from './puzzleData';

interface SolverState {
  grid: boolean[][];
  pieces: PlacedPiece[];
  wildCellCount: number;
  big7Count: number;
}

function getTargetCells(grid: CellState[][]): Coord[] {
  const targets: Coord[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === CellState.Selected) {
        targets.push({ x, y });
      }
    }
  }
  return targets;
}

function canPlace(
  cells: Coord[],
  origin: Coord,
  occupiedGrid: boolean[][],
  targetGrid: CellState[][],
  gridSize: number,
): boolean {
  for (const cell of cells) {
    const ax = origin.x + cell.x;
    const ay = origin.y + cell.y;
    if (ax < 0 || ax >= gridSize || ay < 0 || ay >= gridSize) return false;
    if (occupiedGrid[ay][ax]) return false;
    if (targetGrid[ay][ax] !== CellState.Selected) return false;
  }
  return true;
}

function getAllRotations(shape: PuzzleShape, color?: PuzzleColor): Coord[][] {
  const baseCells = getShapeCells(shape, color);
  const rotations: Coord[][] = [];
  const seen = new Set<string>();

  for (let r = 0; r < 4; r++) {
    const rotated = rotateCells(baseCells, r);
    const key = rotated.map(c => `${c.x},${c.y}`).sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      rotations.push(rotated);
    }
  }
  return rotations;
}

interface PieceOption {
  shape: PuzzleShape;
  color: PuzzleColor;
  cells: Coord[];
  rotation: number;
  size: number;
  isWild: boolean;
  isBig7: boolean;
}

function generatePieceOptions(conditions: AutoConditions): PieceOption[] {
  const options: PieceOption[] = [];

  if (conditions.useBasicShapes) {
    for (const shape of BASIC_SHAPES) {
      const rotations = getAllRotations(shape, PuzzleColor.Blue);
      rotations.forEach((cells, r) => {
        options.push({
          shape,
          color: PuzzleColor.Blue,
          cells,
          rotation: r,
          size: cells.length,
          isWild: false,
          isBig7: false,
        });
      });
    }
  }

  if (conditions.useBig7) {
    const big7Colors = [PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green, PuzzleColor.Yellow, PuzzleColor.Purple];
    for (const color of big7Colors) {
      const rotations = getAllRotations(PuzzleShape.Big7, color);
      rotations.forEach((cells, r) => {
        options.push({
          shape: PuzzleShape.Big7,
          color,
          cells,
          rotation: r,
          size: cells.length,
          isWild: false,
          isBig7: true,
        });
      });
    }
  }

  if (conditions.useWild) {
    for (const shape of WILD_SHAPES) {
      const rotations = getAllRotations(shape, PuzzleColor.Gray);
      rotations.forEach((cells, r) => {
        options.push({
          shape,
          color: PuzzleColor.Gray,
          cells,
          rotation: r,
          size: cells.length,
          isWild: true,
          isBig7: false,
        });
      });
    }
  }

  // 大拼圖優先（greedy），萬能拼圖最後
  options.sort((a, b) => {
    if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
    return b.size - a.size;
  });

  return options;
}

// 維護前 10 個最佳結果
class TopResults {
  private results: AutoResult[] = [];
  private maxKeep: number;

  constructor(maxKeep: number = 10) {
    this.maxKeep = maxKeep;
  }

  add(result: AutoResult) {
    this.results.push(result);
    this.results.sort((a, b) => {
      if (a.wildCellCount !== b.wildCellCount) return a.wildCellCount - b.wildCellCount;
      return a.big7Count - b.big7Count;
    });
    if (this.results.length > this.maxKeep) {
      this.results.pop();
    }
  }

  getResults(): AutoResult[] {
    return [...this.results];
  }
}

export function autoSolve(
  grid: CellState[][],
  gridSize: number,
  conditions: AutoConditions,
  timeLimitMs: number = 20000,
): AutoResult[] {
  const targets = getTargetCells(grid);
  if (targets.length === 0) return [];

  const pieceOptions = generatePieceOptions(conditions);
  if (pieceOptions.length === 0) return [];

  const topResults = new TopResults(10);
  const startTime = Date.now();
  let checkCounter = 0;
  let timeUp = false;

  function isTimeUp(): boolean {
    if (timeUp) return true;
    checkCounter++;
    if (checkCounter % 100 === 0) {
      if (Date.now() - startTime >= timeLimitMs) {
        timeUp = true;
        return true;
      }
    }
    return false;
  }

  function solve(
    state: SolverState,
    remainingTargets: Set<string>,
    depth: number,
  ): void {
    if (isTimeUp()) return;

    if (remainingTargets.size === 0) {
      topResults.add({
        pieces: [...state.pieces],
        wildCellCount: state.wildCellCount,
        big7Count: state.big7Count,
        score: -(state.wildCellCount * 100 + state.big7Count * 10),
      });
      return;
    }

    if (depth > targets.length) return;

    // 找第一個未填的目標格子
    const firstTarget = remainingTargets.values().next().value;
    if (!firstTarget) return;
    const [fx, fy] = firstTarget.split(',').map(Number);

    for (const option of pieceOptions) {
      if (isTimeUp()) return;

      for (const cell of option.cells) {
        const originX = fx - cell.x;
        const originY = fy - cell.y;
        const origin: Coord = { x: originX, y: originY };

        if (canPlace(option.cells, origin, state.grid, grid, gridSize)) {
          const absoluteCells = option.cells.map(c => ({
            x: c.x + origin.x,
            y: c.y + origin.y,
          }));

          const piece: PlacedPiece = {
            id: generateId(),
            pieceId: `${option.shape}_${option.color}`,
            shape: option.shape,
            color: option.color,
            cells: absoluteCells,
            rotation: option.rotation,
            origin,
          };

          const coveredTargets: string[] = [];
          for (const ac of absoluteCells) {
            state.grid[ac.y][ac.x] = true;
            const key = `${ac.x},${ac.y}`;
            if (remainingTargets.has(key)) {
              coveredTargets.push(key);
              remainingTargets.delete(key);
            }
          }

          state.pieces.push(piece);
          if (option.isWild) state.wildCellCount += option.size;
          if (option.isBig7) state.big7Count++;

          solve(state, remainingTargets, depth + 1);

          // 回溯
          state.pieces.pop();
          if (option.isWild) state.wildCellCount -= option.size;
          if (option.isBig7) state.big7Count--;
          for (const ac of absoluteCells) {
            state.grid[ac.y][ac.x] = false;
          }
          for (const key of coveredTargets) {
            remainingTargets.add(key);
          }
        }
      }
    }
  }

  const occupiedGrid = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => false)
  );

  const remainingTargets = new Set(targets.map(t => `${t.x},${t.y}`));

  const initialState: SolverState = {
    grid: occupiedGrid,
    pieces: [],
    wildCellCount: 0,
    big7Count: 0,
  };

  solve(initialState, remainingTargets, 0);

  return topResults.getResults();
}
