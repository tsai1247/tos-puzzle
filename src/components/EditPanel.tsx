import { useEffect, useRef } from 'react';
import { useGame } from '../utils/GameContext';
import { Tool, GamePhase } from '../types';
import type { GridSize } from '../types';
import { exportToFile, importFromFile, decodeData } from '../utils/storage';
import MdiIcon from './MdiIcon';
import { mdiPencil, mdiEraser, mdiSelectDrag, mdiSelectRemove } from '@mdi/js';

const EXAMPLE_CATEGORIES = [
  {
    id: 'general',
    label: '一般用藍圖',
    items: [
      { id: 'miyuki_lv1', label: '角色藍圖「司波深雪」 Lv.1', file: 'general/miyuki_lv1.sol' },
      { id: 'miyuki_lv2', label: '角色藍圖「司波深雪」 Lv.2', file: 'general/miyuki_lv2.sol' },
      { id: 'miyuki_lvmax', label: '角色藍圖「司波深雪」 Lv.MAX', file: 'general/miyuki_lvmax.sol' },
      { id: 'weapon_general', label: '武裝藍圖（泛用型）', file: 'general/weapon_general.sol' },
      { id: 'weapon_tatsuya', label: '武裝藍圖（司波達也）', file: 'general/weapon_tatsuya.sol' },
      { id: 'weapon_miyuki', label: '武裝藍圖（司波深雪）', file: 'general/weapon_miyuki.sol' },
      { id: 'weapon_erika', label: '武裝藍圖（千葉艾莉卡）', file: 'general/weapon_erika.sol' },
      { id: 'weapon_leo', label: '武裝藍圖（西城雷歐赫特）', file: 'general/weapon_leo.sol' },
      { id: 'weapon_mikihiko', label: '武裝藍圖（吉田幹比古）', file: 'general/weapon_mikihiko.sol' },
      { id: 'weapon_mizuki', label: '武裝藍圖（柴田美月）', file: 'general/weapon_mizuki.sol' },
      { id: 'weapon_mayumi', label: '武裝藍圖（七草真由美）', file: 'general/weapon_mayumi.sol' },
      { id: 'weapon_angelina', label: '武裝藍圖（安潔莉娜）', file: 'general/weapon_angelina.sol' },
      { id: 'weapon_minami', label: '武裝藍圖（櫻井水波）', file: 'general/weapon_minami.sol' },
    ],
  },
  {
    id: 'onetime',
    label: '一次性藍圖',
    items: [
      { id: 'skill_1', label: '技能藍圖I', file: 'onetime/skill_1.sol' },
      { id: 'skill_2', label: '技能藍圖II', file: 'onetime/skill_2.sol' },
      { id: 'skill_3', label: '技能藍圖III', file: 'onetime/skill_3.sol' },
      { id: 'resource_sun', label: '資源藍圖（星期日）', file: 'onetime/resource_sun.sol' },
      { id: 'resource_tue', label: '資源藍圖（星期二）', file: 'onetime/resource_tue.sol' },
      { id: 'resource_wed', label: '資源藍圖（星期三）', file: 'onetime/resource_wed.sol' },
      { id: 'resource_thu', label: '資源藍圖（星期四）', file: 'onetime/resource_thu.sol' },
      { id: 'resource_fri', label: '資源藍圖（星期五）', file: 'onetime/resource_fri.sol' },
      { id: 'resource_sat', label: '資源藍圖（星期六）', file: 'onetime/resource_sat.sol' },
    ],
  },
  {
    id: 'memorial_furniture',
    label: '紀念藍圖(傢俱)',
    items: [
      { id: 'miyuki_doll', label: '司波深雪玩偶', file: 'memorial_furniture/miyuki_doll.sol' },
      { id: 'tatsuya_desk', label: '司波達也的書桌', file: 'memorial_furniture/tatsuya_desk.sol' },
      { id: 'tatsuya_pc', label: '司波達也的電腦', file: 'memorial_furniture/tatsuya_pc.sol' },
      { id: 'angelina_poster', label: '安潔莉娜海報', file: 'memorial_furniture/angelina_poster.sol' },
      { id: 'coffee_set', label: '手沖咖啡套組', file: 'memorial_furniture/coffee_set.sol' },
      { id: 'lab_door', label: '研究室門', file: 'memorial_furniture/lab_door.sol' },
    ],
  },
  {
    id: 'memorial_misc',
    label: '紀念藍圖(桌布、勳章)',
    items: [
      { id: 'medal', label: '紀念勳章藍圖', file: 'memorial_misc/medal.sol' },
      { id: 'wallpaper', label: '紀念桌布藍圖', file: 'memorial_misc/wallpaper.sol' },
    ],
  },
];

// 快取已載入的範例資料
const exampleCache: Record<string, { gridSize: GridSize; grid: unknown[][]; placedPieces?: unknown[] }> = {};

export default function EditPanel() {
  const { state, dispatch } = useGame();
  const { gridSize, selectedTool, grid } = state;
  const selectedCategory = state.selectedCategory;
  const selectedExample = state.selectedExampleId;
  const isLoadingExample = useRef(false);
  const lastGridSnapshot = useRef<string>(JSON.stringify(grid));
  const selectedExampleRef = useRef(state.selectedExampleId || 'custom');

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
        dispatch({ type: 'SET_EXAMPLE_SELECTION', category: 'custom', exampleId: '' });
        dispatch({ type: 'SET_BOARD_NAME', name: '自訂版面' });
      }
    }
    lastGridSnapshot.current = currentSnapshot;
  }, [grid, dispatch]);

  const handleCategoryChange = (catId: string) => {
    dispatch({ type: 'SET_EXAMPLE_SELECTION', category: catId, exampleId: '' });
    if (catId === 'custom') {
      selectedExampleRef.current = 'custom';
    }
  };

  const handleExampleChange = async (itemId: string) => {
    dispatch({ type: 'SET_EXAMPLE_SELECTION', category: selectedCategory, exampleId: itemId });
    if (!itemId) return;

    const cat = EXAMPLE_CATEGORIES.find(c => c.id === selectedCategory);
    const item = cat?.items.find(i => i.id === itemId);
    if (!item) return;

    selectedExampleRef.current = itemId;

    try {
      isLoadingExample.current = true;
      if (!exampleCache[itemId]) {
        const res = await fetch(`${import.meta.env.BASE_URL}examples/${item.file}`);
        const encoded = await res.text();
        const data = decodeData(encoded);
        exampleCache[itemId] = data as typeof exampleCache[string];
      }
      const data = exampleCache[itemId];
      dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize as GridSize, grid: data.grid as typeof grid, boardName: item.label });
    } catch {
      alert('載入範例失敗');
      selectedExampleRef.current = 'custom';
      dispatch({ type: 'SET_EXAMPLE_SELECTION', category: 'custom', exampleId: '' });
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
      dispatch({ type: 'SET_EXAMPLE_SELECTION', category: 'custom', exampleId: '' });
    } catch (err) {
      alert(`匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    }
  };

  const handleStartPuzzle = async () => {
    // 如果選的是範例，套用既有解答
    if (selectedCategory !== 'custom' && selectedExample) {
      const cat = EXAMPLE_CATEGORIES.find(c => c.id === selectedCategory);
      const item = cat?.items.find(i => i.id === selectedExample);
      if (item && exampleCache[selectedExample]) {
        const data = exampleCache[selectedExample];
        if (data.placedPieces && (data.placedPieces as unknown[]).length > 0) {
          dispatch({
            type: 'LOAD_STATE',
            gridSize: data.gridSize as GridSize,
            grid: data.grid as typeof grid,
            placedPieces: data.placedPieces as typeof state.placedPieces,
            boardName: item.label,
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select
            value={selectedCategory}
            onChange={e => handleCategoryChange(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #ccc',
              fontSize: 14,
              flex: '1 1 120px',
              maxWidth: 150,
            }}
          >
            <option value="custom">自訂</option>
            {EXAMPLE_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          {selectedCategory !== 'custom' && (
            <select
              value={selectedExample}
              onChange={e => handleExampleChange(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 14,
                flex: '1 1 180px',
              }}
            >
              <option value="">選擇版面...</option>
              {EXAMPLE_CATEGORIES.find(c => c.id === selectedCategory)?.items.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          )}
        </div>
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
