import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { GamePhase, CellState, Tool, PuzzleColor } from '../types';
import type {
  GameState, GridSize, PlacedPiece, AutoConditions, AutoResult,
} from '../types';

const AUTOSAVE_KEY = 'puzzle_autosave';

// 初始化格子
function createGrid(size: GridSize): CellState[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => CellState.Unselected)
  );
}

// 從 localStorage 讀取初始狀態
function loadInitialState(): GameState {
  const defaultState: GameState = {
    phase: GamePhase.Edit,
    gridSize: 9,
    grid: createGrid(9),
    placedPieces: [],
    selectedTool: Tool.SingleSelect,
    boardName: '自訂版面',
    autoConditions: { useBasicShapes: true, useBig7: false, useWild: false, maxWildCells: 8 },
    autoResults: [],
    selectedAutoResult: null,
  };

  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return defaultState;
    const data = JSON.parse(saved) as Partial<GameState>;
    return {
      ...defaultState,
      phase: data.phase || GamePhase.Edit,
      gridSize: data.gridSize || 9,
      grid: data.grid || createGrid(data.gridSize || 9),
      placedPieces: data.placedPieces || [],
      selectedTool: data.selectedTool || Tool.SingleSelect,
      boardName: data.boardName || '自訂版面',
      autoConditions: data.autoConditions || defaultState.autoConditions,
      // 不還原 autoResults 和 selectedAutoResult（需重新計算）
      autoResults: [],
      selectedAutoResult: null,
    };
  } catch {
    return defaultState;
  }
}

// Actions
type Action =
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'SET_GRID_SIZE'; size: GridSize }
  | { type: 'SET_CELL'; x: number; y: number; state: CellState }
  | { type: 'SET_RECT'; x1: number; y1: number; x2: number; y2: number; state: CellState }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_GRID'; grid: CellState[][] }
  | { type: 'PLACE_PIECE'; piece: PlacedPiece }
  | { type: 'REMOVE_PIECE'; pieceId: string }
  | { type: 'SET_PLACED_PIECES'; pieces: PlacedPiece[] }
  | { type: 'SET_AUTO_CONDITIONS'; conditions: AutoConditions }
  | { type: 'SET_AUTO_RESULTS'; results: AutoResult[] }
  | { type: 'SELECT_AUTO_RESULT'; index: number | null }
  | { type: 'LOAD_STATE'; gridSize: GridSize; grid: CellState[][]; placedPieces?: PlacedPiece[]; boardName?: string }
  | { type: 'SET_BOARD_NAME'; name: string }
  | { type: 'RANDOMIZE_COLORS' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'SET_GRID_SIZE': {
      const newGrid = createGrid(action.size);
      return {
        ...state,
        gridSize: action.size,
        grid: newGrid,
        placedPieces: [],
        autoResults: [],
        selectedAutoResult: null,
      };
    }

    case 'SET_CELL': {
      const newGrid = state.grid.map(row => [...row]);
      if (action.y >= 0 && action.y < state.gridSize && action.x >= 0 && action.x < state.gridSize) {
        newGrid[action.y][action.x] = action.state;
      }
      return { ...state, grid: newGrid };
    }

    case 'SET_RECT': {
      const newGrid = state.grid.map(row => [...row]);
      const minX = Math.min(action.x1, action.x2);
      const maxX = Math.max(action.x1, action.x2);
      const minY = Math.min(action.y1, action.y2);
      const maxY = Math.max(action.y1, action.y2);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (y >= 0 && y < state.gridSize && x >= 0 && x < state.gridSize) {
            newGrid[y][x] = action.state;
          }
        }
      }
      return { ...state, grid: newGrid };
    }

    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool };

    case 'SET_GRID':
      return { ...state, grid: action.grid };

    case 'PLACE_PIECE':
      return { ...state, placedPieces: [...state.placedPieces, action.piece] };

    case 'REMOVE_PIECE':
      return {
        ...state,
        placedPieces: state.placedPieces.filter(p => p.id !== action.pieceId),
      };

    case 'SET_PLACED_PIECES':
      return { ...state, placedPieces: action.pieces };

    case 'SET_AUTO_CONDITIONS':
      return { ...state, autoConditions: action.conditions };

    case 'SET_AUTO_RESULTS':
      return { ...state, autoResults: action.results };

    case 'SELECT_AUTO_RESULT':
      if (action.index === null) {
        return { ...state, selectedAutoResult: null, placedPieces: [] };
      }
      return {
        ...state,
        selectedAutoResult: action.index,
        placedPieces: state.autoResults[action.index]?.pieces || [],
      };

    case 'LOAD_STATE':
      return {
        ...state,
        gridSize: action.gridSize,
        grid: action.grid,
        placedPieces: action.placedPieces || [],
        boardName: action.boardName || state.boardName,
        autoResults: [],
        selectedAutoResult: null,
      };

    case 'SET_BOARD_NAME':
      return { ...state, boardName: action.name.slice(0, 30) };

    case 'RANDOMIZE_COLORS': {
      const colors: PuzzleColor[] = [
        PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green,
        PuzzleColor.Yellow, PuzzleColor.Purple,
      ];
      const newPieces: PlacedPiece[] = state.placedPieces.map(piece => {
        if (piece.color !== PuzzleColor.Gray && piece.shape !== 'big7') {
          const randomColor = colors[Math.floor(Math.random() * colors.length)];
          return { ...piece, color: randomColor };
        }
        return piece;
      });
      return { ...state, placedPieces: newPieces };
    }

    default:
      return state;
  }
}

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 每 5 秒自動儲存
  useEffect(() => {
    const interval = setInterval(() => {
      const s = stateRef.current;
      const toSave = {
        phase: s.phase,
        gridSize: s.gridSize,
        grid: s.grid,
        placedPieces: s.placedPieces,
        selectedTool: s.selectedTool,
        boardName: s.boardName,
        autoConditions: s.autoConditions,
      };
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toSave));
      } catch {
        // localStorage 滿了或不可用，靜默忽略
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 頁面離開前也儲存一次
  useEffect(() => {
    const handleBeforeUnload = () => {
      const s = stateRef.current;
      const toSave = {
        phase: s.phase,
        gridSize: s.gridSize,
        grid: s.grid,
        placedPieces: s.placedPieces,
        selectedTool: s.selectedTool,
        boardName: s.boardName,
        autoConditions: s.autoConditions,
      };
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toSave));
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
