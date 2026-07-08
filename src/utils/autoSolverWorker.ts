// Web Worker for auto-solving puzzles using Dancing Links (DLX)
// Optimizations:
// 1. Wild pieces limited to max 8 cells total
// 2. Early stop if best result is 0 wild cells and no improvement for 10s
// 3. Deduplicate solutions by placement fingerprint

import { CellState, PuzzleColor, PuzzleShape } from '../types';
import type { Coord, PlacedPiece, AutoConditions, AutoResult } from '../types';
import { getShapeCells, rotateCells, generateId, BASIC_SHAPES, WILD_SHAPES } from './puzzleData';

interface WorkerMessage {
  grid: CellState[][];
  gridSize: number;
  conditions: AutoConditions;
  timeLimitMs: number;
  seed: number;
}

// ===== Seeded random shuffle =====
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ===== Dancing Links Data Structure =====

interface DLXNode {
  left: number;
  right: number;
  up: number;
  down: number;
  column: number;
  row: number;
}

interface DLXColumn {
  size: number;
  name: number;
}

class DLX {
  nodes: DLXNode[] = [];
  columns: DLXColumn[] = [];
  header: number = 0;
  numColumns: number;
  solution: number[] = [];

  constructor(numColumns: number) {
    this.numColumns = numColumns;
    this.header = this.createNode(-1, -1);

    for (let i = 0; i < numColumns; i++) {
      const colNode = this.createNode(-1, i);
      this.columns.push({ size: 0, name: i });

      const lastRight = this.nodes[this.header].left;
      this.nodes[colNode].left = lastRight;
      this.nodes[colNode].right = this.header;
      this.nodes[lastRight].right = colNode;
      this.nodes[this.header].left = colNode;
    }
  }

  createNode(row: number, column: number): number {
    const idx = this.nodes.length;
    this.nodes.push({ left: idx, right: idx, up: idx, down: idx, column, row });
    return idx;
  }

  addRow(rowId: number, columnIndices: number[]): void {
    if (columnIndices.length === 0) return;

    let firstNode = -1;
    for (const col of columnIndices) {
      const colHeader = col + 1;
      const node = this.createNode(rowId, col);

      const lastUp = this.nodes[colHeader].up;
      this.nodes[node].up = lastUp;
      this.nodes[node].down = colHeader;
      this.nodes[lastUp].down = node;
      this.nodes[colHeader].up = node;
      this.columns[col].size++;

      if (firstNode === -1) {
        firstNode = node;
      } else {
        const lastRight = this.nodes[firstNode].left;
        this.nodes[node].left = lastRight;
        this.nodes[node].right = firstNode;
        this.nodes[lastRight].right = node;
        this.nodes[firstNode].left = node;
      }
    }
  }

  cover(colIdx: number): void {
    const colHeader = colIdx + 1;
    const l = this.nodes[colHeader].left;
    const r = this.nodes[colHeader].right;
    this.nodes[l].right = r;
    this.nodes[r].left = l;

    let rowNode = this.nodes[colHeader].down;
    while (rowNode !== colHeader) {
      let j = this.nodes[rowNode].right;
      while (j !== rowNode) {
        const u = this.nodes[j].up;
        const d = this.nodes[j].down;
        this.nodes[u].down = d;
        this.nodes[d].up = u;
        this.columns[this.nodes[j].column].size--;
        j = this.nodes[j].right;
      }
      rowNode = this.nodes[rowNode].down;
    }
  }

  uncover(colIdx: number): void {
    const colHeader = colIdx + 1;
    let rowNode = this.nodes[colHeader].up;
    while (rowNode !== colHeader) {
      let j = this.nodes[rowNode].left;
      while (j !== rowNode) {
        const u = this.nodes[j].up;
        const d = this.nodes[j].down;
        this.nodes[u].down = j;
        this.nodes[d].up = j;
        this.columns[this.nodes[j].column].size++;
        j = this.nodes[j].left;
      }
      rowNode = this.nodes[rowNode].up;
    }

    const l = this.nodes[colHeader].left;
    const r = this.nodes[colHeader].right;
    this.nodes[l].right = colHeader;
    this.nodes[r].left = colHeader;
  }

  chooseColumn(): number {
    let minSize = Infinity;
    let minCol = -1;
    let node = this.nodes[this.header].right;
    while (node !== this.header) {
      const col = this.nodes[node].column;
      if (this.columns[col].size < minSize) {
        minSize = this.columns[col].size;
        minCol = col;
      }
      node = this.nodes[node].right;
    }
    return minCol;
  }

  isEmpty(): boolean {
    return this.nodes[this.header].right === this.header;
  }
}

// ===== Puzzle-specific logic =====

interface PieceOption {
  shape: PuzzleShape;
  color: PuzzleColor;
  cells: Coord[];
  rotation: number;
  size: number;
  isWild: boolean;
  isBig7: boolean;
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

function generatePieceOptions(conditions: AutoConditions): PieceOption[] {
  const options: PieceOption[] = [];

  if (conditions.useBasicShapes) {
    for (const shape of BASIC_SHAPES) {
      const rotations = getAllRotations(shape, PuzzleColor.Blue);
      rotations.forEach((cells, r) => {
        options.push({ shape, color: PuzzleColor.Blue, cells, rotation: r, size: cells.length, isWild: false, isBig7: false });
      });
    }
  }

  if (conditions.useBig7) {
    const allBig7Colors = [PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green, PuzzleColor.Yellow, PuzzleColor.Purple];
    // Combine useBig7Colors and requiredBig7Colors
    const selectedColors = new Set([
      ...(conditions.useBig7Colors || []),
      ...(conditions.requireBig7 ? (conditions.requiredBig7Colors || []) : []),
    ]);
    const enabledBig7Colors = selectedColors.size > 0
      ? allBig7Colors.filter(c => selectedColors.has(c))
      : allBig7Colors;
    for (const color of enabledBig7Colors) {
      const rotations = getAllRotations(PuzzleShape.Big7, color);
      rotations.forEach((cells, r) => {
        options.push({ shape: PuzzleShape.Big7, color, cells, rotation: r, size: cells.length, isWild: false, isBig7: true });
      });
    }
  }

  if (conditions.useWild) {
    for (const shape of WILD_SHAPES) {
      const rotations = getAllRotations(shape, PuzzleColor.Gray);
      rotations.forEach((cells, r) => {
        options.push({ shape, color: PuzzleColor.Gray, cells, rotation: r, size: cells.length, isWild: true, isBig7: false });
      });
    }
  }

  return options;
}

interface Placement {
  option: PieceOption;
  origin: Coord;
  absoluteCells: Coord[];
  coveredIndices: number[];
}

function generateAllPlacements(
  targetSet: Map<string, number>,
  gridSize: number,
  pieceOptions: PieceOption[],
): Placement[] {
  const placements: Placement[] = [];

  for (const option of pieceOptions) {
    for (let oy = 0; oy < gridSize; oy++) {
      for (let ox = 0; ox < gridSize; ox++) {
        const absoluteCells = option.cells.map(c => ({ x: c.x + ox, y: c.y + oy }));

        let valid = true;
        const coveredIndices: number[] = [];
        for (const ac of absoluteCells) {
          if (ac.x < 0 || ac.x >= gridSize || ac.y < 0 || ac.y >= gridSize) {
            valid = false;
            break;
          }
          const key = `${ac.x},${ac.y}`;
          const idx = targetSet.get(key);
          if (idx === undefined) {
            valid = false;
            break;
          }
          coveredIndices.push(idx);
        }

        if (valid && coveredIndices.length === option.cells.length) {
          placements.push({ option, origin: { x: ox, y: oy }, absoluteCells, coveredIndices });
        }
      }
    }
  }

  return placements;
}

// Generate a fingerprint for a solution to detect duplicates
function solutionFingerprint(solutionRows: number[], placements: Placement[]): string {
  // Sort placement coordinates to create a canonical representation
  const parts: string[] = [];
  for (const rowIdx of solutionRows) {
    const p = placements[rowIdx];
    // Use shape+rotation+origin as identifier for each piece placement
    parts.push(`${p.option.shape}:${p.option.rotation}:${p.origin.x},${p.origin.y}`);
  }
  return parts.sort().join('|');
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { grid, gridSize, conditions, timeLimitMs, seed } = e.data;

  const targets = getTargetCells(grid);
  if (targets.length === 0) {
    self.postMessage({ type: 'done', results: [] });
    return;
  }

  const pieceOptions = generatePieceOptions(conditions);
  if (pieceOptions.length === 0) {
    self.postMessage({ type: 'done', results: [] });
    return;
  }

  const targetSet = new Map<string, number>();
  targets.forEach((t, i) => targetSet.set(`${t.x},${t.y}`, i));

  const rng = seededRandom(seed);
  const placements = shuffle(generateAllPlacements(targetSet, gridSize, pieceOptions), rng);

  if (placements.length === 0) {
    self.postMessage({ type: 'done', results: [] });
    return;
  }

  // Build DLX matrix
  const numColumns = targets.length;
  const dlx = new DLX(numColumns);

  for (let i = 0; i < placements.length; i++) {
    dlx.addRow(i, placements[i].coveredIndices);
  }

  // Solve state
  let topResults: AutoResult[] = [];
  const maxKeep = 10;
  const startTime = Date.now();
  let checkCounter = 0;
  let timeUp = false;
  let lastUpdateTime = 0;
  let hasNewResults = false;
  let lastImprovementTime = startTime;
  const MAX_WILD_CELLS = conditions.maxWildCells || 8;

  // Deduplication set
  const seenFingerprints = new Set<string>();

  // Current wild cell count during search (for pruning)
  let currentWildCells = 0;

  function shouldStop(): boolean {
    if (timeUp) return true;
    checkCounter++;
    if (checkCounter % 200 === 0) {
      const now = Date.now();
      if (now - startTime >= timeLimitMs) {
        timeUp = true;
        return true;
      }
      // Early stop: best is 0 wild + 10s no improvement
      if (topResults.length > 0 && topResults[0].wildCellCount === 0) {
        if (now - lastImprovementTime >= 10000) {
          timeUp = true;
          return true;
        }
      }
    }
    return false;
  }

  function addResult(solutionRows: number[]) {
    // Check wild cell constraint
    let wildCellCount = 0;
    let big7Count = 0;
    const big7ColorsUsed = new Set<string>();
    for (const rowIdx of solutionRows) {
      const p = placements[rowIdx];
      if (p.option.isWild) wildCellCount += p.option.size;
      if (p.option.isBig7) {
        big7Count++;
        big7ColorsUsed.add(p.option.color);
      }
    }

    // Constraint: max wild cells
    if (wildCellCount > MAX_WILD_CELLS) return;

    // Constraint: requireBig7 — must include at least one big7 of each required color
    if (conditions.requireBig7 && conditions.requiredBig7Colors.length > 0) {
      for (const reqColor of conditions.requiredBig7Colors) {
        if (!big7ColorsUsed.has(reqColor)) return;
      }
    }

    // Deduplication
    const fp = solutionFingerprint(solutionRows, placements);
    if (seenFingerprints.has(fp)) return;
    seenFingerprints.add(fp);

    const pieces: PlacedPiece[] = [];
    for (const rowIdx of solutionRows) {
      const placement = placements[rowIdx];
      pieces.push({
        id: generateId(),
        pieceId: `${placement.option.shape}_${placement.option.color}`,
        shape: placement.option.shape,
        color: placement.option.color,
        cells: placement.absoluteCells,
        rotation: placement.option.rotation,
        origin: placement.origin,
      });
    }

    const result: AutoResult = {
      pieces,
      wildCellCount,
      big7Count,
      score: -(wildCellCount * 100 + big7Count * 10),
    };

    // Check if this improves our top results
    const prevBest = topResults.length > 0 ? topResults[0].wildCellCount * 100 + topResults[0].big7Count : Infinity;

    topResults.push(result);
    topResults.sort((a, b) => {
      if (a.wildCellCount !== b.wildCellCount) return a.wildCellCount - b.wildCellCount;
      return a.big7Count - b.big7Count;
    });
    if (topResults.length > maxKeep) {
      topResults = topResults.slice(0, maxKeep);
    }

    const newBest = topResults[0].wildCellCount * 100 + topResults[0].big7Count;
    if (newBest < prevBest) {
      lastImprovementTime = Date.now();
    }

    hasNewResults = true;
    const now = Date.now();
    if (now - lastUpdateTime >= 1000) {
      lastUpdateTime = now;
      hasNewResults = false;
      self.postMessage({ type: 'update', results: [...topResults] });
    }
  }

  function solve(): void {
    if (shouldStop()) return;

    if (dlx.isEmpty()) {
      addResult([...dlx.solution]);
      return;
    }

    const col = dlx.chooseColumn();
    if (col === -1 || dlx.columns[col].size === 0) return;

    dlx.cover(col);

    const colHeader = col + 1;
    let rowNode = dlx.nodes[colHeader].down;
    while (rowNode !== colHeader) {
      if (shouldStop()) break;

      const rowIdx = dlx.nodes[rowNode].row;
      const placement = placements[rowIdx];

      // Pruning: skip if adding this wild piece would exceed limit
      if (placement.option.isWild && currentWildCells + placement.option.size > MAX_WILD_CELLS) {
        rowNode = dlx.nodes[rowNode].down;
        continue;
      }

      dlx.solution.push(rowIdx);
      if (placement.option.isWild) currentWildCells += placement.option.size;

      let j = dlx.nodes[rowNode].right;
      while (j !== rowNode) {
        dlx.cover(dlx.nodes[j].column);
        j = dlx.nodes[j].right;
      }

      solve();

      dlx.solution.pop();
      if (placement.option.isWild) currentWildCells -= placement.option.size;

      j = dlx.nodes[rowNode].left;
      while (j !== rowNode) {
        dlx.uncover(dlx.nodes[j].column);
        j = dlx.nodes[j].left;
      }

      rowNode = dlx.nodes[rowNode].down;
    }

    dlx.uncover(col);
  }

  solve();

  if (hasNewResults) {
    self.postMessage({ type: 'update', results: [...topResults] });
  }
  self.postMessage({ type: 'done', results: topResults });
};
