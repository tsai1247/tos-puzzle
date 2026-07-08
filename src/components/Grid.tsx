import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useGame } from '../utils/GameContext';
import { CellState, GamePhase, Tool } from '../types';
import type { PlacedPiece, Coord } from '../types';
import { COLOR_MAP, BORDER_COLOR_MAP, getShapeCells, rotateCells } from '../utils/puzzleData';

interface GridProps {
  onPieceSelect?: (piece: PlacedPiece | null) => void;
  onPieceDrop?: (piece: PlacedPiece, targetOrigin: Coord) => void;
  selectedPiece?: PlacedPiece | null;
  previewCells?: Coord[];
  onRotatePiece?: () => void;
  onDeletePiece?: () => void;
  onChangeColor?: () => void;
}

export default function Grid({ onPieceSelect, onPieceDrop, selectedPiece, previewCells, onRotatePiece, onDeletePiece, onChangeColor }: GridProps) {
  const { state, dispatch } = useGame();
  const { grid, gridSize, phase, selectedTool, placedPieces } = state;

  // 編輯模式狀態
  const [isDragging, setIsDragging] = useState(false);
  const [rectStart, setRectStart] = useState<Coord | null>(null);
  const [rectEnd, setRectEnd] = useState<Coord | null>(null);
  const draggedCells = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const rectStartRef = useRef<Coord | null>(null);

  // 拼圖拖曳狀態
  const [puzzleDragPiece, setPuzzleDragPiece] = useState<PlacedPiece | null>(null);
  const [dragPreviewOrigin, setDragPreviewOrigin] = useState<Coord | null>(null);
  const puzzleDragRef = useRef<PlacedPiece | null>(null);
  const puzzleDragStartCoord = useRef<Coord | null>(null);
  const hasMoved = useRef(false);

  // 容器
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const availableWidth = containerWidth - 28;
  const cellSize = Math.max(Math.min(availableWidth / gridSize, 40), 12);

  const getCellStateForTool = useCallback((tool: Tool): CellState => {
    if (tool === Tool.SingleSelect || tool === Tool.RectSelect) {
      return CellState.Selected;
    }
    return CellState.Unselected;
  }, []);

  const getPieceAt = useCallback((x: number, y: number): PlacedPiece | undefined => {
    return placedPieces.find(p => p.cells.some(c => c.x === x && c.y === y));
  }, [placedPieces]);

  const isPreviewCell = useCallback((x: number, y: number): boolean => {
    return previewCells?.some(c => c.x === x && c.y === y) || false;
  }, [previewCells]);

  const getPieceBorders = useCallback((piece: PlacedPiece, x: number, y: number) => {
    const hasTop = piece.cells.some(c => c.x === x && c.y === y + 1);
    const hasBottom = piece.cells.some(c => c.x === x && c.y === y - 1);
    const hasLeft = piece.cells.some(c => c.x === x - 1 && c.y === y);
    const hasRight = piece.cells.some(c => c.x === x + 1 && c.y === y);
    return { hasTop, hasBottom, hasLeft, hasRight };
  }, []);

  // 拖曳預覽格子 — 自動 clamp 到邊界內
  const clampedDragOrigin = useMemo((): Coord | null => {
    if (!puzzleDragPiece || !dragPreviewOrigin) return null;
    const baseCells = getShapeCells(puzzleDragPiece.shape, puzzleDragPiece.color);
    const rotatedCells = rotateCells(baseCells, puzzleDragPiece.rotation);
    const minCellX = Math.min(...rotatedCells.map(c => c.x));
    const maxCellX = Math.max(...rotatedCells.map(c => c.x));
    const minCellY = Math.min(...rotatedCells.map(c => c.y));
    const maxCellY = Math.max(...rotatedCells.map(c => c.y));

    const clampedX = Math.max(-minCellX, Math.min(gridSize - 1 - maxCellX, dragPreviewOrigin.x));
    const clampedY = Math.max(-minCellY, Math.min(gridSize - 1 - maxCellY, dragPreviewOrigin.y));
    return { x: clampedX, y: clampedY };
  }, [puzzleDragPiece, dragPreviewOrigin, gridSize]);

  const dragPreviewSet = useMemo((): Set<string> => {
    if (!puzzleDragPiece || !clampedDragOrigin) return new Set();
    const baseCells = getShapeCells(puzzleDragPiece.shape, puzzleDragPiece.color);
    const rotatedCells = rotateCells(baseCells, puzzleDragPiece.rotation);
    return new Set(
      rotatedCells.map(c => `${c.x + clampedDragOrigin.x},${c.y + clampedDragOrigin.y}`)
    );
  }, [puzzleDragPiece, clampedDragOrigin]);

  // 浮動按鈕位置 — 拼圖正下方
  const actionButtonPosition = useMemo(() => {
    if (!selectedPiece || phase !== GamePhase.Puzzle || puzzleDragPiece) return null;
    const minX = Math.min(...selectedPiece.cells.map(c => c.x));
    const maxX = Math.max(...selectedPiece.cells.map(c => c.x));
    const minY = Math.min(...selectedPiece.cells.map(c => c.y));
    const showLabels = cellSize >= 18;
    const labelOffset = showLabels ? 22 : 0;
    // 水平居中於拼圖
    const centerPx = labelOffset + ((minX + maxX) / 2 + 0.5) * cellSize;
    // 在拼圖最下方的格子下面（y=0 在畫面最下面，所以 minY 對應畫面上最下方）
    const bottomPy = (gridSize - 1 - minY + 1) * cellSize + 4;
    return { left: centerPx, top: bottomPy };
  }, [selectedPiece, phase, cellSize, gridSize, puzzleDragPiece]);

  const getCellFromElement = (el: Element | null): Coord | null => {
    if (!el) return null;
    const cellEl = (el as HTMLElement).closest('[data-cell]');
    if (!cellEl) return null;
    const x = parseInt(cellEl.getAttribute('data-x') || '', 10);
    const y = parseInt(cellEl.getAttribute('data-y') || '', 10);
    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
  };

  // === 拼圖模式：開始拖曳 ===
  const startPuzzleDrag = (x: number, y: number) => {
    const piece = getPieceAt(x, y);
    if (piece) {
      if (selectedPiece?.id === piece.id) {
        // 已選中 → 允許拖曳
        setPuzzleDragPiece(piece);
        puzzleDragRef.current = piece;
        puzzleDragStartCoord.current = { x, y };
        hasMoved.current = false;
        setDragPreviewOrigin(piece.origin);
      } else {
        // 未選中 → 選取
        if (onPieceSelect) onPieceSelect(piece);
      }
    } else {
      // 點擊空白
      if (onPieceSelect) onPieceSelect(null);
    }
  };

  const movePuzzleDrag = (x: number, y: number) => {
    if (!puzzleDragRef.current) return;
    hasMoved.current = true;
    setDragPreviewOrigin({ x, y });
  };

  const endPuzzleDrag = () => {
    const piece = puzzleDragRef.current;
    if (!piece) return;

    if (hasMoved.current && clampedDragOrigin) {
      // 有移動 → 嘗試放置（使用 clamp 後的位置）
      if (onPieceDrop) {
        onPieceDrop(piece, clampedDragOrigin);
      }
    } else {
      // 沒有移動 → 視為選取
      if (onPieceSelect) {
        if (selectedPiece?.id === piece.id) {
          onPieceSelect(null);
        } else {
          onPieceSelect(piece);
        }
      }
    }

    setPuzzleDragPiece(null);
    puzzleDragRef.current = null;
    puzzleDragStartCoord.current = null;
    hasMoved.current = false;
    setDragPreviewOrigin(null);
  };

  // === Mouse Events ===
  const handleMouseDown = (x: number, y: number) => {
    if (phase === GamePhase.Edit) {
      if (selectedTool === Tool.SingleSelect || selectedTool === Tool.SingleDeselect) {
        setIsDragging(true);
        isDraggingRef.current = true;
        draggedCells.current = new Set([`${x},${y}`]);
        dispatch({ type: 'SET_CELL', x, y, state: getCellStateForTool(selectedTool) });
      } else {
        setRectStart({ x, y });
        setRectEnd({ x, y });
        rectStartRef.current = { x, y };
      }
    } else if (phase === GamePhase.Puzzle) {
      startPuzzleDrag(x, y);
    }
  };

  const handleMouseMove = (x: number, y: number) => {
    if (phase === GamePhase.Edit) {
      if (isDragging && (selectedTool === Tool.SingleSelect || selectedTool === Tool.SingleDeselect)) {
        const key = `${x},${y}`;
        if (!draggedCells.current.has(key)) {
          draggedCells.current.add(key);
          dispatch({ type: 'SET_CELL', x, y, state: getCellStateForTool(selectedTool) });
        }
      } else if (rectStart && (selectedTool === Tool.RectSelect || selectedTool === Tool.RectDeselect)) {
        setRectEnd({ x, y });
      }
    } else if (phase === GamePhase.Puzzle) {
      movePuzzleDrag(x, y);
    }
  };

  const handleMouseUp = () => {
    if (phase === GamePhase.Edit) {
      if (isDragging) {
        setIsDragging(false);
        isDraggingRef.current = false;
        draggedCells.current = new Set();
      } else if (rectStart && rectEnd) {
        const targetState = getCellStateForTool(selectedTool);
        dispatch({
          type: 'SET_RECT',
          x1: rectStart.x, y1: rectStart.y,
          x2: rectEnd.x, y2: rectEnd.y,
          state: targetState,
        });
        setRectStart(null);
        setRectEnd(null);
        rectStartRef.current = null;
      }
    } else if (phase === GamePhase.Puzzle) {
      endPuzzleDrag();
    }
  };

  // === Touch Events ===
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const coord = getCellFromElement(el);
    if (!coord) return;
    e.preventDefault();

    if (phase === GamePhase.Edit) {
      if (selectedTool === Tool.SingleSelect || selectedTool === Tool.SingleDeselect) {
        setIsDragging(true);
        isDraggingRef.current = true;
        draggedCells.current = new Set([`${coord.x},${coord.y}`]);
        dispatch({ type: 'SET_CELL', x: coord.x, y: coord.y, state: getCellStateForTool(selectedTool) });
      } else {
        setRectStart(coord);
        setRectEnd(coord);
        rectStartRef.current = coord;
      }
    } else if (phase === GamePhase.Puzzle) {
      startPuzzleDrag(coord.x, coord.y);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const coord = getCellFromElement(el);
    if (!coord) return;
    e.preventDefault();

    if (phase === GamePhase.Edit) {
      if (isDraggingRef.current && (selectedTool === Tool.SingleSelect || selectedTool === Tool.SingleDeselect)) {
        const key = `${coord.x},${coord.y}`;
        if (!draggedCells.current.has(key)) {
          draggedCells.current.add(key);
          dispatch({ type: 'SET_CELL', x: coord.x, y: coord.y, state: getCellStateForTool(selectedTool) });
        }
      } else if (rectStartRef.current && (selectedTool === Tool.RectSelect || selectedTool === Tool.RectDeselect)) {
        setRectEnd(coord);
      }
    } else if (phase === GamePhase.Puzzle) {
      movePuzzleDrag(coord.x, coord.y);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();

    if (phase === GamePhase.Edit) {
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false;
        draggedCells.current = new Set();
      } else if (rectStartRef.current && rectEnd) {
        const targetState = getCellStateForTool(selectedTool);
        dispatch({
          type: 'SET_RECT',
          x1: rectStartRef.current.x, y1: rectStartRef.current.y,
          x2: rectEnd.x, y2: rectEnd.y,
          state: targetState,
        });
        setRectStart(null);
        setRectEnd(null);
        rectStartRef.current = null;
      }
    } else if (phase === GamePhase.Puzzle) {
      endPuzzleDrag();
    }
  };

  const isInRectPreview = (x: number, y: number): boolean => {
    if (!rectStart || !rectEnd) return false;
    const minX = Math.min(rectStart.x, rectEnd.x);
    const maxX = Math.max(rectStart.x, rectEnd.x);
    const minY = Math.min(rectStart.y, rectEnd.y);
    const maxY = Math.max(rectStart.y, rectEnd.y);
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const renderCell = (x: number, y: number) => {
    const cellState = grid[y][x];
    const piece = getPieceAt(x, y);
    const isPreview = isPreviewCell(x, y);
    const isRectPreview = isInRectPreview(x, y);
    const isSelected = selectedPiece && piece && piece.id === selectedPiece.id;
    const isDragPreview = dragPreviewSet.has(`${x},${y}`);
    const isDraggedPiece = puzzleDragPiece && piece && piece.id === puzzleDragPiece.id;

    let backgroundColor = '#f0f0f0';
    const borderDefault = '1px solid #ddd';

    if (phase === GamePhase.Edit) {
      if (cellState === CellState.Selected) {
        backgroundColor = '#a8d8a8';
      } else {
        backgroundColor = '#f5f5f5';
      }
      if (isRectPreview) {
        backgroundColor = selectedTool === Tool.RectSelect || selectedTool === Tool.SingleSelect
          ? '#7bc87b'
          : '#ffaaaa';
      }
    } else {
      // 拼圖階段 — 優先級：拖曳預覽 > 被拖曳原位 > 普通拼圖
      if (isDragPreview) {
        const color = puzzleDragPiece!.color;
        return (
          <div
            key={`${x}-${y}`}
            data-cell
            data-x={x}
            data-y={y}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: COLOR_MAP[color],
              opacity: 0.6,
              border: `2px dashed ${BORDER_COLOR_MAP[color]}`,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
            onMouseDown={() => handleMouseDown(x, y)}
            onMouseMove={() => handleMouseMove(x, y)}
          />
        );
      }
      if (isDraggedPiece && hasMoved.current) {
        return (
          <div
            key={`${x}-${y}`}
            data-cell
            data-x={x}
            data-y={y}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: '#ddd',
              border: '1px dashed #bbb',
              boxSizing: 'border-box',
              flexShrink: 0,
              opacity: 0.4,
            }}
            onMouseDown={() => handleMouseDown(x, y)}
            onMouseMove={() => handleMouseMove(x, y)}
          />
        );
      }
      if (piece) {
        backgroundColor = COLOR_MAP[piece.color];
        const borders = getPieceBorders(piece, x, y);
        const borderColor = BORDER_COLOR_MAP[piece.color];
        const innerBorder = `1px solid ${backgroundColor}`;
        const outerBorder = `2px solid ${borderColor}`;

        return (
          <div
            key={`${x}-${y}`}
            data-cell
            data-x={x}
            data-y={y}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor,
              borderTop: borders.hasTop ? innerBorder : outerBorder,
              borderRight: borders.hasRight ? innerBorder : outerBorder,
              borderBottom: borders.hasBottom ? innerBorder : outerBorder,
              borderLeft: borders.hasLeft ? innerBorder : outerBorder,
              boxSizing: 'border-box',
              cursor: 'grab',
              opacity: isSelected ? 0.85 : 1,
              outline: isSelected ? '2px solid #333' : 'none',
              flexShrink: 0,
            }}
            onMouseDown={() => handleMouseDown(x, y)}
            onMouseMove={() => handleMouseMove(x, y)}
          />
        );
      }
      if (isPreview) {
        backgroundColor = '#aaddff88';
      } else if (cellState === CellState.Selected) {
        backgroundColor = '#e8e8e8';
      } else {
        backgroundColor = '#f9f9f9';
      }
    }

    return (
      <div
        key={`${x}-${y}`}
        data-cell
        data-x={x}
        data-y={y}
        style={{
          width: cellSize,
          height: cellSize,
          backgroundColor,
          border: borderDefault,
          boxSizing: 'border-box',
          cursor: phase === GamePhase.Edit ? 'crosshair' : 'default',
          flexShrink: 0,
        }}
        onMouseDown={() => handleMouseDown(x, y)}
        onMouseMove={() => handleMouseMove(x, y)}
      />
    );
  };

  const showLabels = cellSize >= 18;

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ userSelect: 'none', touchAction: 'none', width: '100%', position: 'relative' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 'fit-content' }}>
        {Array.from({ length: gridSize }, (_, rowIdx) => {
          const y = gridSize - 1 - rowIdx;
          return (
            <div key={y} style={{ display: 'flex', alignItems: 'center' }}>
              {showLabels && (
                <span style={{
                  width: 20,
                  textAlign: 'right',
                  marginRight: 2,
                  fontSize: Math.max(cellSize * 0.35, 8),
                  color: '#888',
                  flexShrink: 0,
                }}>
                  {y}
                </span>
              )}
              {Array.from({ length: gridSize }, (_, x) => renderCell(x, y))}
            </div>
          );
        })}
        {showLabels && (
          <div style={{ display: 'flex', marginLeft: 22 }}>
            {Array.from({ length: gridSize }, (_, x) => (
              <span
                key={x}
                style={{
                  width: cellSize,
                  textAlign: 'center',
                  fontSize: Math.max(cellSize * 0.35, 8),
                  color: '#888',
                  flexShrink: 0,
                }}
              >
                {x}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 浮動操作按鈕 */}
      {actionButtonPosition && selectedPiece && !puzzleDragPiece && (
        <div
          style={{
            position: 'absolute',
            left: actionButtonPosition.left,
            top: actionButtonPosition.top,
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 4,
            zIndex: 20,
          }}
        >
          {onRotatePiece && (
            <button
              onClick={(e) => { e.stopPropagation(); onRotatePiece(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onRotatePiece(); }}
              style={floatingBtnStyle}
              title="旋轉"
            >
              ↻
            </button>
          )}
          {onDeletePiece && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeletePiece(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onDeletePiece(); }}
              style={{ ...floatingBtnStyle, backgroundColor: '#ff5555', color: 'white' }}
              title="刪除"
            >
              ✕
            </button>
          )}
          {onChangeColor && selectedPiece.color !== 'gray' && selectedPiece.shape !== 'big7' && (
            <button
              onClick={(e) => { e.stopPropagation(); onChangeColor(); }}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onChangeColor(); }}
              style={{ ...floatingBtnStyle, backgroundColor: '#fff3cd' }}
              title="換色"
            >
              🎨
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const floatingBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid #999',
  backgroundColor: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 'bold',
  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
  touchAction: 'manipulation',
};
