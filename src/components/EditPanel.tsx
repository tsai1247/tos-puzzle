import { useGame } from '../utils/GameContext';
import { Tool, GamePhase } from '../types';
import type { GridSize } from '../types';
import { exportToFile, importFromFile } from '../utils/storage';

export default function EditPanel() {
  const { state, dispatch } = useGame();
  const { gridSize, selectedTool, grid } = state;

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
      dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize, grid: data.grid });
    } catch (err) {
      alert(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  };

  const handleStartPuzzle = () => {
    dispatch({ type: 'SET_PHASE', phase: GamePhase.Puzzle });
  };

  const sizes: GridSize[] = [9, 12, 16, 20];
  const tools: { tool: Tool; label: string }[] = [
    { tool: Tool.SingleSelect, label: '單格選中' },
    { tool: Tool.SingleDeselect, label: '單格取消' },
    { tool: Tool.RectSelect, label: '方形選中' },
    { tool: Tool.RectDeselect, label: '方形取消' },
  ];

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 'clamp(16px, 3vw, 18px)' }}>編輯階段</h2>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
          {tools.map(({ tool, label }) => (
            <button
              key={tool}
              onClick={() => dispatch({ type: 'SET_TOOL', tool })}
              style={{
                padding: '8px 10px',
                backgroundColor: selectedTool === tool ? '#4a90d9' : '#eee',
                color: selectedTool === tool ? 'white' : '#333',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: selectedTool === tool ? 'bold' : 'normal',
              }}
            >
              {label}
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
