import { CellState } from '../types';
import type { EncodedData, GridSize, PlacedPiece } from '../types';

const CURRENT_VERSION = 1;

export function encodeData(gridSize: GridSize, grid: CellState[][], placedPieces?: PlacedPiece[]): string {
  const data: EncodedData = {
    version: CURRENT_VERSION,
    gridSize,
    grid,
    placedPieces,
  };
  return btoa(JSON.stringify(data));
}

export function decodeData(encoded: string): EncodedData {
  try {
    const json = atob(encoded);
    const data = JSON.parse(json) as EncodedData;
    if (!data.version || !data.gridSize || !data.grid) {
      throw new Error('Invalid data format');
    }
    return data;
  } catch {
    throw new Error('無法解碼檔案，格式不正確');
  }
}

export function saveToLocalStorage(key: string, gridSize: GridSize, grid: CellState[][], placedPieces?: PlacedPiece[]): void {
  const encoded = encodeData(gridSize, grid, placedPieces);
  localStorage.setItem(key, encoded);
}

export function loadFromLocalStorage(key: string): EncodedData | null {
  const encoded = localStorage.getItem(key);
  if (!encoded) return null;
  return decodeData(encoded);
}

export function exportToFile(gridSize: GridSize, grid: CellState[][], placedPieces?: PlacedPiece[]): void {
  const encoded = encodeData(gridSize, grid, placedPieces);
  const blob = new Blob([encoded], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `puzzle_${gridSize}x${gridSize}_${Date.now()}.puzzle`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromFile(): Promise<EncodedData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.puzzle';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未選擇檔案'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = decodeData(reader.result as string);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
