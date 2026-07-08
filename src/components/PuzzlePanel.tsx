import { useState, useCallback, useRef } from 'react';
import { useGame } from '../utils/GameContext';
import { GamePhase, CellState, PuzzleShape, PuzzleColor } from '../types';
import type { PlacedPiece, Coord, AutoResult } from '../types';
import { getShapeCells, rotateCells, cellsToAbsolute, generateId, COLOR_MAP } from '../utils/puzzleData';
import { exportToFile, importFromFile } from '../utils/storage';
import { encodeForUrl } from '../utils/urlShare';
import PuzzlePalette from './PuzzlePalette';
import Grid from './Grid';

type PuzzleMode = 'manual' | 'auto';

export default function PuzzlePanel() {
  const { state, dispatch } = useGame();
  const { grid, gridSize, placedPieces, autoConditions, autoResults, selectedAutoResult } = state;

  const [mode, setMode] = useState<PuzzleMode>('manual');
  const [selectedPlacedPiece, setSelectedPlacedPiece] = useState<PlacedPiece | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [solveTimeInput, setSolveTimeInput] = useState('20');
  const [countdown, setCountdown] = useState(0);
  const [seedChanged, setSeedChanged] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // 統計數值
  const totalSelected = grid.flat().filter(c => c === CellState.Selected).length;
  const filledSelected = placedPieces.reduce((count, piece) => {
    return count + piece.cells.filter(c =>
      c.y >= 0 && c.y < gridSize && c.x >= 0 && c.x < gridSize &&
      grid[c.y][c.x] === CellState.Selected
    ).length;
  }, 0);
  const overflow = placedPieces.reduce((count, piece) => {
    return count + piece.cells.filter(c =>
      c.y >= 0 && c.y < gridSize && c.x >= 0 && c.x < gridSize &&
      grid[c.y][c.x] !== CellState.Selected
    ).length;
  }, 0);
  const unfilled = totalSelected - filledSelected;

  // 找一個不重疊且最接近中間的空白位置
  const findSpawnPosition = useCallback((cells: Coord[]): Coord | null => {
    const occupied = new Set(
      placedPieces.flatMap(p => p.cells.map(c => `${c.x},${c.y}`))
    );
    const centerX = Math.floor(gridSize / 2);
    const centerY = Math.floor(gridSize / 2);

    for (let dist = 0; dist < gridSize; dist++) {
      for (let dy = -dist; dy <= dist; dy++) {
        for (let dx = -dist; dx <= dist; dx++) {
          if (Math.abs(dx) !== dist && Math.abs(dy) !== dist) continue;
          const ox = centerX + dx;
          const oy = centerY + dy;
          const absCells = cellsToAbsolute(cells, { x: ox, y: oy });
          const outOfBounds = absCells.some(c =>
            c.x < 0 || c.x >= gridSize || c.y < 0 || c.y >= gridSize
          );
          if (outOfBounds) continue;
          const hasOverlap = absCells.some(c => occupied.has(`${c.x},${c.y}`));
          if (!hasOverlap) return { x: ox, y: oy };
        }
      }
    }
    return null;
  }, [gridSize, placedPieces]);

  // 從面板生成拼圖 — 立即放到場地
  const handleSpawnPiece = useCallback((shape: PuzzleShape, color: PuzzleColor, rotation: number) => {
    const baseCells = getShapeCells(shape, color);

    const rotationsToTry = [rotation, (rotation + 1) % 4, (rotation + 2) % 4, (rotation + 3) % 4];
    let foundOrigin: Coord | null = null;
    let foundRotation = rotation;
    let foundCells: Coord[] = [];

    for (const r of rotationsToTry) {
      const rotatedCells = rotateCells(baseCells, r);
      const origin = findSpawnPosition(rotatedCells);
      if (origin) {
        foundOrigin = origin;
        foundRotation = r;
        foundCells = cellsToAbsolute(rotatedCells, origin);
        break;
      }
    }

    if (!foundOrigin) {
      alert('場地上沒有空位可以放置');
      return;
    }

    const piece: PlacedPiece = {
      id: generateId(),
      pieceId: `${shape}_${color}`,
      shape,
      color,
      cells: foundCells,
      rotation: foundRotation,
      origin: foundOrigin,
    };
    dispatch({ type: 'PLACE_PIECE', piece });
    setSelectedPlacedPiece(piece);
  }, [findSpawnPosition, dispatch]);

  // Grid 回調：選取拼圖
  const handlePieceSelect = useCallback((piece: PlacedPiece | null) => {
    setSelectedPlacedPiece(piece);
  }, []);

  // Grid 回調：拖曳放下
  const handlePieceDrop = useCallback((piece: PlacedPiece, targetOrigin: Coord) => {
    const baseCells = getShapeCells(piece.shape, piece.color);
    const rotatedCells = rotateCells(baseCells, piece.rotation);
    const absoluteCells = cellsToAbsolute(rotatedCells, targetOrigin);

    const occupied = new Set(
      placedPieces
        .filter(p => p.id !== piece.id)
        .flatMap(p => p.cells.map(c => `${c.x},${c.y}`))
    );
    const hasOverlap = absoluteCells.some(c => occupied.has(`${c.x},${c.y}`));
    const outOfBounds = absoluteCells.some(c =>
      c.x < 0 || c.x >= gridSize || c.y < 0 || c.y >= gridSize
    );

    if (!hasOverlap && !outOfBounds) {
      dispatch({ type: 'REMOVE_PIECE', pieceId: piece.id });
      const newPiece: PlacedPiece = {
        ...piece,
        cells: absoluteCells,
        origin: targetOrigin,
      };
      dispatch({ type: 'PLACE_PIECE', piece: newPiece });
      setSelectedPlacedPiece(newPiece);
    }
    // 如果放不下，拼圖留在原位
  }, [placedPieces, gridSize, dispatch]);

  // 旋轉選中的拼圖
  const handleRotatePiece = useCallback(() => {
    if (!selectedPlacedPiece) return;
    const newRotation = (selectedPlacedPiece.rotation + 1) % 4;
    const baseCells = getShapeCells(selectedPlacedPiece.shape, selectedPlacedPiece.color);
    const rotatedCells = rotateCells(baseCells, newRotation);
    const absoluteCells = cellsToAbsolute(rotatedCells, selectedPlacedPiece.origin);

    const occupied = new Set(
      placedPieces
        .filter(p => p.id !== selectedPlacedPiece.id)
        .flatMap(p => p.cells.map(c => `${c.x},${c.y}`))
    );
    const hasOverlap = absoluteCells.some(c => occupied.has(`${c.x},${c.y}`));
    const outOfBounds = absoluteCells.some(c =>
      c.x < 0 || c.x >= gridSize || c.y < 0 || c.y >= gridSize
    );

    if (hasOverlap || outOfBounds) return;

    dispatch({ type: 'REMOVE_PIECE', pieceId: selectedPlacedPiece.id });
    const newPiece: PlacedPiece = {
      ...selectedPlacedPiece,
      rotation: newRotation,
      cells: absoluteCells,
    };
    dispatch({ type: 'PLACE_PIECE', piece: newPiece });
    setSelectedPlacedPiece(newPiece);
  }, [selectedPlacedPiece, placedPieces, gridSize, dispatch]);

  // 刪除選中的拼圖
  const handleDeletePiece = useCallback(() => {
    if (!selectedPlacedPiece) return;
    dispatch({ type: 'REMOVE_PIECE', pieceId: selectedPlacedPiece.id });
    setSelectedPlacedPiece(null);
  }, [selectedPlacedPiece, dispatch]);

  // 變色選中的拼圖（循環五色）
  const handleChangeColor = useCallback(() => {
    if (!selectedPlacedPiece) return;
    const colors: PuzzleColor[] = [
      PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green,
      PuzzleColor.Yellow, PuzzleColor.Purple,
    ];
    const currentIdx = colors.indexOf(selectedPlacedPiece.color as PuzzleColor);
    const nextColor = colors[(currentIdx + 1) % colors.length];
    dispatch({ type: 'REMOVE_PIECE', pieceId: selectedPlacedPiece.id });
    const newPiece: PlacedPiece = { ...selectedPlacedPiece, color: nextColor };
    dispatch({ type: 'PLACE_PIECE', piece: newPiece });
    setSelectedPlacedPiece(newPiece);
  }, [selectedPlacedPiece, dispatch]);

  const handleRandomizeColors = () => {
    dispatch({ type: 'RANDOMIZE_COLORS' });
  };

  const handleAutoSolve = () => {
    const { useBasicShapes, useBig7, useWild } = autoConditions;
    if (!useBasicShapes && !useBig7 && !useWild) {
      alert('至少要選一個條件');
      return;
    }
    setIsAutoRunning(true);

    const secondsPerRound = parseInt(solveTimeInput) || 20;
    const totalSeconds = secondsPerRound;
    const NUM_WORKERS = 4;

    // 倒數計時（總時間）
    setCountdown(totalSeconds);
    const globalEndTime = Date.now() + totalSeconds * 1000;
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((globalEndTime - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }, 1000);

    let mergedResults: AutoResult[] = [...autoResults];
    let currentRound = 0;
    let activeWorkers: Worker[] = [];
    let lastImprovementTime = Date.now();
    let bestScore = mergedResults.length > 0 ? mergedResults[0].wildCellCount * 100 + mergedResults[0].big7Count * 10 : Infinity;
    let staleCheckInterval: ReturnType<typeof setInterval> | null = null;

    const mergeAndUpdate = (results: AutoResult[]) => {
      const prevBest = bestScore;
      mergedResults = [...mergedResults, ...results];
      mergedResults.sort((a, b) => {
        if (a.wildCellCount !== b.wildCellCount) return a.wildCellCount - b.wildCellCount;
        return a.big7Count - b.big7Count;
      });
      mergedResults = mergedResults.slice(0, 10);

      // 檢查是否有改善
      const newScore = mergedResults.length > 0 ? mergedResults[0].wildCellCount * 100 + mergedResults[0].big7Count * 10 : Infinity;
      if (newScore < prevBest) {
        bestScore = newScore;
        lastImprovementTime = Date.now();
      }

      dispatch({ type: 'SET_AUTO_RESULTS', results: mergedResults });
      if (mergedResults.length > 0) {
        dispatch({ type: 'SELECT_AUTO_RESULT', index: 0 });
        dispatch({ type: 'RANDOMIZE_COLORS' });
      }
    };

    const cleanup = () => {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      if (staleCheckInterval) { clearInterval(staleCheckInterval); staleCheckInterval = null; }
      setIsAutoRunning(false);
      setCountdown(0);
      activeWorkers.forEach(w => w.terminate());
      activeWorkers = [];
      stopRef.current = null;
    };
    stopRef.current = cleanup;

    // 強制換 seed：終止當前 worker，開新一輪
    const forceRestartRound = () => {
      activeWorkers.forEach(w => w.terminate());
      activeWorkers = [];
      currentRound++;
      lastImprovementTime = Date.now();
      setSeedChanged(true);
      setTimeout(() => setSeedChanged(false), 1500);
      startRound();
    };

    // 每 2 秒檢查是否 10 秒沒有改善
    staleCheckInterval = setInterval(() => {
      if (Date.now() - lastImprovementTime >= 10000 && activeWorkers.length > 0) {
        forceRestartRound();
      }
    }, 2000);

    const startRound = () => {
      // 時間到則停止
      if (Date.now() >= globalEndTime) {
        cleanup();
        if (mergedResults.length === 0) {
          alert('找不到完美組合');
        }
        return;
      }

      let doneCount = 0;
      activeWorkers = [];
      const roundSeedBase = Date.now() + currentRound * 99999;

      for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker(
          new URL('../utils/autoSolverWorker.ts', import.meta.url),
          { type: 'module' }
        );
        activeWorkers.push(worker);

        worker.postMessage({
          grid,
          gridSize,
          conditions: autoConditions,
          timeLimitMs: Math.max(1000, globalEndTime - Date.now()),
          seed: roundSeedBase + i * 12345,
        });

        worker.onmessage = (e) => {
          const { type, results } = e.data;
          mergeAndUpdate(results);

          if (type === 'done') {
            doneCount++;
            if (doneCount >= NUM_WORKERS) {
              activeWorkers.forEach(w => w.terminate());
              activeWorkers = [];
              currentRound++;
              lastImprovementTime = Date.now();
              startRound();
            }
          }
        };

        worker.onerror = (err) => {
          console.error('Worker error:', err);
          doneCount++;
          if (doneCount >= NUM_WORKERS) {
            activeWorkers.forEach(w => w.terminate());
            activeWorkers = [];
            currentRound++;
            startRound();
          }
        };
      }
    };

    startRound();
  };

  const handleBackToEdit = () => {
    const choice = confirm('返回編輯將清空拼圖結果。\n按「確定」返回編輯，按「取消」留在拼圖階段。\n\n（如需匯出請先使用匯出功能）');
    if (!choice) return;
    dispatch({ type: 'SET_PHASE', phase: GamePhase.Edit });
    dispatch({ type: 'SET_PLACED_PIECES', pieces: [] });
    dispatch({ type: 'SET_AUTO_RESULTS', results: [] });
  };

  const handleExportPuzzle = () => {
    exportToFile(gridSize, grid, placedPieces, '.sol');
  };

  const handleImportPuzzle = async () => {
    try {
      const data = await importFromFile();
      if (data.gridSize !== gridSize || JSON.stringify(data.grid) !== JSON.stringify(grid)) {
        if (!confirm('場地大小或版面與當前不符合，是否覆蓋？')) return;
      }
      dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize, grid: data.grid, placedPieces: data.placedPieces });
    } catch (err) {
      alert(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);

  const handleExportImage = () => {
    setShowExportModal(true);
  };

  const handleDownloadImage = () => {
    const el = document.getElementById('export-modal-content');
    if (!el) return;
    import('html2canvas').then(({ default: html2canvas }) => {
      html2canvas(el, { backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${state.boardName || 'puzzle'}.png`;
        link.href = canvas.toDataURL();
        link.click();
      });
    }).catch(() => {
      alert('匯出圖片失敗');
    });
  };

  const handleShare = () => {
    const encoded = encodeForUrl(gridSize, grid, placedPieces);
    const nameParam = state.boardName ? `&n=${encodeURIComponent(state.boardName)}` : '';
    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}${nameParam}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('分享連結已複製到剪貼簿！');
    }).catch(() => {
      prompt('複製以下連結分享：', url);
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
    }}>
      {/* 左側：拼圖板 */}
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        {/* 版面名稱 */}
        <div style={{ marginBottom: 6 }}>
          <input
            type="text"
            value={state.boardName}
            onChange={e => dispatch({ type: 'SET_BOARD_NAME', name: e.target.value })}
            maxLength={30}
            style={{
              fontSize: 'clamp(14px, 3vw, 16px)',
              fontWeight: 'bold',
              border: 'none',
              borderBottom: '1px solid #ccc',
              background: 'transparent',
              padding: '2px 4px',
              width: '100%',
              maxWidth: 300,
            }}
          />
        </div>
        {/* 統計 + 隨機換色 */}
        <div style={{
          display: 'flex',
          gap: 'clamp(8px, 2vw, 16px)',
          marginBottom: 10,
          padding: '8px 10px',
          backgroundColor: '#f8f8f8',
          borderRadius: 4,
          fontSize: 'clamp(12px, 2.5vw, 14px)',
          flexWrap: 'wrap',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <span>已拼：<strong>{filledSelected}</strong></span>
          <span>未拼：<strong>{unfilled}</strong></span>
          <span style={{ color: overflow > 0 ? 'red' : '#333' }}>
            超出：<strong>{overflow}</strong>
          </span>
          <button
            onClick={handleRandomizeColors}
            style={{
              marginLeft: 'auto',
              padding: '4px 8px',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            🎨 換色
          </button>
        </div>

        <div id="puzzle-grid">
          <Grid
            onPieceSelect={handlePieceSelect}
            onPieceDrop={handlePieceDrop}
            selectedPiece={selectedPlacedPiece}
            onRotatePiece={handleRotatePiece}
            onDeletePiece={handleDeletePiece}
            onChangeColor={handleChangeColor}
          />
        </div>
      </div>

      {/* 右側：控制面板 */}
      <div style={{
        flex: '1 1 260px',
        minWidth: 200,
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* 模式切換 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setMode('manual')}
            disabled={isAutoRunning}
            style={{
              ...btnStyle,
              flex: 1,
              backgroundColor: mode === 'manual' ? '#4a90d9' : '#eee',
              color: mode === 'manual' ? 'white' : '#333',
              opacity: isAutoRunning ? 0.5 : 1,
            }}
          >
            手動模式
          </button>
          <button
            onClick={() => setMode('auto')}
            disabled={isAutoRunning}
            style={{
              ...btnStyle,
              flex: 1,
              backgroundColor: mode === 'auto' ? '#4a90d9' : '#eee',
              color: mode === 'auto' ? 'white' : '#333',
              opacity: isAutoRunning ? 0.5 : 1,
            }}
          >
            自動模式
          </button>
        </div>

        {/* 手動模式 */}
        {mode === 'manual' && (
          <>
            <PuzzlePalette onSpawnPiece={handleSpawnPiece} />
            <button
              onClick={() => {
                if (placedPieces.length === 0 || confirm('確定清空所有拼圖？')) {
                  dispatch({ type: 'SET_PLACED_PIECES', pieces: [] });
                  setSelectedPlacedPiece(null);
                }
              }}
              style={{ ...btnStyle, width: '100%', backgroundColor: '#ffdddd' }}
            >
              🗑️ 清空拼圖
            </button>
          </>
        )}

        {/* 自動模式 */}
        {mode === 'auto' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>條件選擇</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={autoConditions.useBasicShapes}
                onChange={e => dispatch({
                  type: 'SET_AUTO_CONDITIONS',
                  conditions: { ...autoConditions, useBasicShapes: e.target.checked },
                })}
                style={{ width: 18, height: 18 }}
              />
              基本形狀
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={autoConditions.useBig7 || autoConditions.requireBig7}
                disabled={autoConditions.requireBig7}
                onChange={e => dispatch({
                  type: 'SET_AUTO_CONDITIONS',
                  conditions: { ...autoConditions, useBig7: e.target.checked },
                })}
                style={{ width: 18, height: 18 }}
              />
              大型7格拼圖
            </label>
            {(autoConditions.useBig7 || autoConditions.requireBig7) && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 24, flexWrap: 'wrap' }}>
                {([PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green, PuzzleColor.Yellow, PuzzleColor.Purple] as const).map(color => {
                  const isRequired = autoConditions.requireBig7 && autoConditions.requiredBig7Colors.includes(color);
                  const isChecked = (autoConditions.useBig7Colors || []).includes(color) || isRequired;
                  return (
                    <label key={color} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isRequired}
                        onChange={e => {
                          const colors = e.target.checked
                            ? [...(autoConditions.useBig7Colors || []), color]
                            : (autoConditions.useBig7Colors || []).filter(c => c !== color);
                          dispatch({
                            type: 'SET_AUTO_CONDITIONS',
                            conditions: { ...autoConditions, useBig7Colors: colors },
                          });
                        }}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ width: 12, height: 12, backgroundColor: COLOR_MAP[color], borderRadius: 2, display: 'inline-block' }} />
                    </label>
                  );
                })}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={autoConditions.useWild}
                onChange={e => dispatch({
                  type: 'SET_AUTO_CONDITIONS',
                  conditions: { ...autoConditions, useWild: e.target.checked },
                })}
                style={{ width: 18, height: 18 }}
              />
              萬能拼圖
              {autoConditions.useWild && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>上限</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={autoConditions.maxWildCells}
                    onChange={e => dispatch({
                      type: 'SET_AUTO_CONDITIONS',
                      conditions: { ...autoConditions, maxWildCells: Math.max(1, parseInt(e.target.value) || 8) },
                    })}
                    style={{ width: 40, padding: '2px 4px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                  />
                  <span style={{ fontSize: 12, color: '#666' }}>格</span>
                </span>
              )}
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={autoConditions.requireBig7}
                onChange={e => dispatch({
                  type: 'SET_AUTO_CONDITIONS',
                  conditions: { ...autoConditions, requireBig7: e.target.checked, useBig7: e.target.checked ? true : autoConditions.useBig7, requiredBig7Colors: e.target.checked ? autoConditions.requiredBig7Colors : [] },
                })}
                style={{ width: 18, height: 18 }}
              />
              至少使用一個大型拼圖
            </label>
            {autoConditions.requireBig7 && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 24, flexWrap: 'wrap' }}>
                {([PuzzleColor.Blue, PuzzleColor.Red, PuzzleColor.Green, PuzzleColor.Yellow, PuzzleColor.Purple] as const).map(color => (
                  <label key={color} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={autoConditions.requiredBig7Colors.includes(color)}
                      onChange={e => {
                        const colors = e.target.checked
                          ? [...autoConditions.requiredBig7Colors, color]
                          : autoConditions.requiredBig7Colors.filter(c => c !== color);
                        dispatch({
                          type: 'SET_AUTO_CONDITIONS',
                          conditions: { ...autoConditions, requiredBig7Colors: colors },
                        });
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ width: 12, height: 12, backgroundColor: COLOR_MAP[color], borderRadius: 2, display: 'inline-block' }} />
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13 }}>搜尋時間：</label>
              <input
                type="number"
                min={1}
                max={300}
                value={solveTimeInput}
                onChange={e => setSolveTimeInput(e.target.value)}
                style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc' }}
              />
              <span style={{ fontSize: 12, color: '#666' }}>秒</span>
              {seedChanged && (
                <span style={{
                  fontSize: 12,
                  color: '#e65100',
                  fontWeight: 'bold',
                  animation: 'blink 0.4s ease-in-out infinite alternate',
                  marginLeft: 4,
                }}>
                  🔄 換方向搜尋
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleAutoSolve}
                disabled={isAutoRunning}
                style={{
                  ...btnStyle,
                  flex: 1,
                  backgroundColor: '#4ad94a',
                  color: 'white',
                  fontWeight: 'bold',
                  opacity: isAutoRunning ? 0.6 : 1,
                  padding: '10px 12px',
                }}
              >
                {isAutoRunning ? `計算中... ${countdown}s` : '開始計算'}
              </button>
              {isAutoRunning && (
                <button
                  onClick={() => stopRef.current?.()}
                  style={{
                    ...btnStyle,
                    backgroundColor: '#ff5555',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: '10px 12px',
                  }}
                >
                  停止
                </button>
              )}
            </div>

            {autoResults.length > 0 && (
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                <h4 style={{ margin: '8px 0 4px', fontSize: 13 }}>
                  找到 {autoResults.length} 種組合
                </h4>
                {autoResults.map((result, idx) => (
                  <div
                    key={idx}
                    onClick={() => dispatch({ type: 'SELECT_AUTO_RESULT', index: idx })}
                    style={{
                      padding: '8px 10px',
                      margin: '3px 0',
                      backgroundColor: selectedAutoResult === idx ? '#d4edff' : '#f8f8f8',
                      border: selectedAutoResult === idx ? '1px solid #4a90d9' : '1px solid #eee',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    #{idx + 1}: 萬能{result.wildCellCount}格　7格×{result.big7Count}　
                    共 {result.pieces.length} 塊
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                if ((placedPieces.length === 0 && autoResults.length === 0) || confirm('確定清空所有拼圖與候選組合？')) {
                  dispatch({ type: 'SET_PLACED_PIECES', pieces: [] });
                  dispatch({ type: 'SET_AUTO_RESULTS', results: [] });
                  setSelectedPlacedPiece(null);
                }
              }}
              style={{ ...btnStyle, width: '100%', backgroundColor: '#ffdddd' }}
            >
              🗑️ 清空拼圖
            </button>
          </div>
        )}

        {/* 檔案操作 */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 4 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>檔案</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: 6,
          }}>
            <button onClick={handleExportPuzzle} style={btnStyle}>匯出檔案</button>
            <button onClick={handleImportPuzzle} style={btnStyle}>匯入檔案</button>
            <button onClick={handleExportImage} style={btnStyle}>匯出圖片</button>
            <button onClick={handleShare} style={{ ...btnStyle, backgroundColor: '#d4edff' }}>分享連結</button>
          </div>
          <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>自動儲存中（每 5 秒）</p>
        </div>

        {/* 返回編輯 */}
        <button
          onClick={handleBackToEdit}
          style={{
            ...btnStyle,
            backgroundColor: '#ff9800',
            color: 'white',
            marginTop: 8,
            width: '100%',
            padding: '10px 12px',
          }}
        >
          ← 返回編輯
        </button>
      </div>

      {/* 匯出圖片 Modal */}
      {showExportModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }} onClick={() => setShowExportModal(false)}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative',
          }} onClick={e => e.stopPropagation()}>
            {/* 工具列 */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid #eee',
              position: 'sticky',
              top: 0,
              backgroundColor: '#fff',
              zIndex: 1,
            }}>
              <button
                onClick={handleDownloadImage}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20 }}
                title="下載圖片"
              >
                ⬇️
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20 }}
                title="關閉"
              >
                ✕
              </button>
            </div>
            {/* 匯出內容 */}
            <div id="export-modal-content" style={{ padding: 16, width: 'fit-content' }}>
              <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                {state.boardName}
              </div>
              <Grid
                selectedPiece={null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#eee',
  border: '1px solid #ccc',
  borderRadius: 4,
  cursor: 'pointer',
};
