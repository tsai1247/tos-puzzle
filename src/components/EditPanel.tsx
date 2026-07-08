import { useState, useEffect, useRef } from 'react';
import { useGame } from '../utils/GameContext';
import { Tool, GamePhase } from '../types';
import type { GridSize } from '../types';
import { exportToFile, importFromFile, decodeData } from '../utils/storage';
import MdiIcon from './MdiIcon';
import { mdiPencil, mdiEraser, mdiSelectDrag, mdiSelectRemove } from '@mdi/js';

const EXAMPLES = [
  { id: 'custom', label: '自訂', file: '' },
  { id: 'miyuki_lv1', label: '角色藍圖「司波深雪」 Lv.1', file: 'miyuki_lv1.sol' },
  { id: 'miyuki_lv2', label: '角色藍圖「司波深雪」 Lv.2', file: 'miyuki_lv2.sol' },
  { id: 'miyuki_lvmax', label: '角色藍圖「司波深雪」 Lv.MAX', file: 'miyuki_lvmax.sol' },
];

// 快取已載入的範例資料
const exampleCache: Record<string, { gridSize: GridSize; grid: unknown[][]; placedPieces?: unknown[] }> = {};

export default function EditPanel() {
  const { state, dispatch } = useGame();
  const { gridSize, selectedTool, grid } = state;
  const [selectedExample, setSelectedExample] = useState('custom');
  const isLoadingExample = useRef(false);
  const lastGridSnapshot = useRef<string>(JSON.stringify(grid));
  const selectedExampleRef = useRef('custom');

  // 偵測版面變更 → 切回自訂
  useEffect(() => {
    if (isLoadingExample.current) {
      lastGridSnapshot.current = JSON.stringify(grid);
      isLoadingExample.current = false;
      return;
    }
    const currentSnapshot = JSON.stringify(grid);
    if (currentSnapshot !== lastGridSnapshot.current) {
      if (selectedExampleRef.current !== 'custom') {
        selectedExampleRef.current = 'custom';
        setSelectedExample('custom');
        dispatch({ type: 'SET_BOARD_NAME', name: '自訂版面' });
      }
    }
    lastGridSnapshot.current = currentSnapshot;
  }, [grid, dispatch]);

  const handleExampleChange = async (id: string) => {
    setSelectedExample(id);
    selectedExampleRef.current = id;
    if (id === 'custom') return;

    const ex = EXAMPLES.find(e => e.id === id);
    if (!ex || !ex.file) return;

    try {
      isLoadingExample.current = true;
      if (!exampleCache[id]) {
        const res = await fetch(`${import.meta.env.BASE_URL}examples/${ex.file}`);
        const encoded = await res.text();
        const data = decodeData(encoded);
        exampleCache[id] = data as typeof exampleCache[string];
      }
      const data = exampleCache[id];
      dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize as GridSize, grid: data.grid as typeof grid, boardName: ex.label });
    } catch {
      alert('載入範例失敗');
      setSelectedExample('custom');
      isLoadingExample.current = false;
    }
  };

  const handleSizeChange = (size: GridSize) => {
    if (size !== gridSize) {
      if (confirm(`切換場地大小為 ${size}x${size}？目前的編輯將會遺失。`)) {
        dispatch({ type: 'SET_GRID_SIZE', size });
      }
    }
  };

  const handleExport = () => {
    exportToFile(gridSize, grid);
  };

  const handleImport = async () => {
    try {
      const data = await importFromFile();
      isLoadingExample.current = true;
      dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize, grid: data.grid });
      setSelectedExample('custom');
    } catch (err) {
      alert(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  };

  const handleStartPuzzle = async () => {
    // 如果選的是範例，套用既有解答
    if (selectedExample !== 'custom') {
      const ex = EXAMPLES.find(e => e.id === selectedExample);
      if (ex && ex.file && exampleCache[selectedExample]) {
        const data = exampleCache[selectedExample];
        if (data.placedPieces && (data.placedPieces as unknown[]).length > 0) {
          dispatch({
            type: 'LOAD_STATE',
            gridSize: data.gridSize as GridSize,
            grid: data.grid as typeof grid,
            placedPieces: data.placedPieces as typeof state.placedPieces,
            boardName: ex.label,
          });
          dispatch({ type: 'SET_PHASE', phase: GamePhase.Puzzle });
          return;
        }
      }
    }
    dispatch({ type: 'SET_BOARD_NAME', name: '自訂版面' });
    dispatch({ type: 'SET_PHASE', phase: GamePhase.Puzzle });
  };

  const sizes: GridSize[] = [9, 12, 16, 20];
  const tools: { tool: Tool; icon: string; title: string }[] = [
    { tool: Tool.SingleSelect, icon: mdiPencil, title: '單格選中' },
    { tool: Tool.SingleDeselect, icon: mdiEraser, title: '單格取消' },
    { tool: Tool.RectSelect, icon: mdiSelectDrag, title: '方形選中' },
    { tool: Tool.RectDeselect, icon: mdiSelectRemove, title: '方形取消' },
  ];

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 'clamp(16px, 3vw, 18px)' }}>編輯階段</h2>

      {/* 範例選擇 */}
      <div>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 13 }}>版面</h3>
        <select
          value={selectedExample}
          onChange={e => handleExampleChange(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid #ccc',
            fontSize: 14,
            width: '100%',
            maxWidth: 250,
          }}
        >
          {EXAMPLES.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.label}</option>
          ))}
        </select>
      </div>

      {/* 場地大小 */}
      <div>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 13 }}>場地大小</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sizes.map(size => (
            <button
              key={size}
              onClick={() => handleSizeChange(size)}
              style={{
                padding: '8px 14px',
                backgroundColor: gridSize === size ? '#4a90d9' : '#eee',
                color: gridSize === size ? 'white' : '#333',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: gridSize === size ? 'bold' : 'normal',
                minWidth: 54,
              }}
            >
              {size}×{size}
            </button>
          ))}
        </div>
      </div>

      {/* 選取工具 */}
      <div>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 13 }}>工具</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {tools.map(({ tool, icon, title }) => (
            <button
              key={tool}
              onClick={() => dispatch({ type: 'SET_TOOL', tool })}
              title={title}
              style={{
                padding: 8,
                backgroundColor: selectedTool === tool ? '#4a90d9' : '#eee',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MdiIcon path={icon} size={22} color={selectedTool === tool ? 'white' : '#333'} />
            </button>
          ))}
        </div>
      </div>

      {/* 匯出/匯入 */}
      <div>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 13 }}>檔案</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleExport} style={btnStyle}>匯出</button>
          <button onClick={handleImport} style={btnStyle}>匯入</button>
        </div>
        <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>自動儲存中（每 5 秒）</p>
      </div>

      {/* 開始拼圖 */}
      <button
        onClick={handleStartPuzzle}
        style={{
          padding: '12px 20px',
          backgroundColor: '#4ad94a',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 'bold',
          marginTop: 8,
          width: '100%',
        }}
      >
        開始拼圖 →
      </button>
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
