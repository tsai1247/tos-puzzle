import { useState } from 'react';
import { PuzzleColor, PuzzleShape } from '../types';
import type { Coord } from '../types';
import { getShapeCells, rotateCells, COLOR_MAP, BORDER_COLOR_MAP } from '../utils/puzzleData';

interface PuzzlePaletteProps {
  onSpawnPiece: (shape: PuzzleShape, color: PuzzleColor, rotation: number) => void;
}

interface PieceEntry {
  shape: PuzzleShape;
  color: PuzzleColor;
  label: string;
}

function getPiecesForColor(color: PuzzleColor): PieceEntry[] {
  if (color === PuzzleColor.Gray) {
    return [
      { shape: PuzzleShape.Wild1, color: PuzzleColor.Gray, label: '1×1' },
      { shape: PuzzleShape.Wild2, color: PuzzleColor.Gray, label: '1×2' },
      { shape: PuzzleShape.Wild3, color: PuzzleColor.Gray, label: '1×3' },
    ];
  }
  return [
    { shape: PuzzleShape.T, color, label: 'T字型' },
    { shape: PuzzleShape.Cross, color, label: '十字型' },
    { shape: PuzzleShape.L, color, label: 'L字型' },
    { shape: PuzzleShape.Line, color, label: '一字型' },
    { shape: PuzzleShape.Big7, color, label: '大型7格' },
  ];
}

const TABS: { color: PuzzleColor; label: string }[] = [
  { color: PuzzleColor.Blue, label: '藍' },
  { color: PuzzleColor.Red, label: '紅' },
  { color: PuzzleColor.Green, label: '綠' },
  { color: PuzzleColor.Yellow, label: '黃' },
  { color: PuzzleColor.Purple, label: '紫' },
  { color: PuzzleColor.Gray, label: '萬能' },
];

function PiecePreview({ cells, color, size = 14 }: { cells: Coord[]; color: PuzzleColor; size?: number }) {
  const maxX = Math.max(...cells.map(c => c.x)) + 1;
  const maxY = Math.max(...cells.map(c => c.y)) + 1;
  const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));

  return (
    <div style={{ display: 'inline-block' }}>
      {Array.from({ length: maxY }, (_, ry) => {
        const y = maxY - 1 - ry;
        return (
          <div key={y} style={{ display: 'flex' }}>
            {Array.from({ length: maxX }, (_, x) => (
              <div
                key={x}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: cellSet.has(`${x},${y}`) ? COLOR_MAP[color] : 'transparent',
                  border: cellSet.has(`${x},${y}`) ? `1px solid ${BORDER_COLOR_MAP[color]}` : '1px solid transparent',
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function PuzzlePalette({ onSpawnPiece }: PuzzlePaletteProps) {
  const [activeTab, setActiveTab] = useState<PuzzleColor>(PuzzleColor.Blue);
  const [rotation, setRotation] = useState(0);

  const pieces = getPiecesForColor(activeTab);

  const handleClickPiece = (entry: PieceEntry) => {
    // 立刻生成
    onSpawnPiece(entry.shape, entry.color, rotation);
  };

  const handleRotate = () => {
    setRotation((rotation + 1) % 4);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>拼圖選擇</h3>
        <button onClick={handleRotate} style={rotateBtnStyle} title="預設旋轉角度">
          ↻ {rotation * 90}°
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.color}
            onClick={() => setActiveTab(tab.color)}
            style={{
              padding: '6px 10px',
              border: 'none',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
              backgroundColor: activeTab === tab.color ? COLOR_MAP[tab.color] : '#e8e8e8',
              color: activeTab === tab.color ? 'white' : '#555',
              fontWeight: activeTab === tab.color ? 'bold' : 'normal',
              fontSize: 13,
              opacity: activeTab === tab.color ? 1 : 0.8,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 拼圖列表 — 點擊即生成 */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        padding: 8,
        backgroundColor: '#f8f8f8',
        borderRadius: '0 4px 4px 4px',
        minHeight: 60,
      }}>
        {pieces.map((entry, i) => {
          const cells = rotateCells(getShapeCells(entry.shape, entry.color), rotation);
          return (
            <div
              key={i}
              onClick={() => handleClickPiece(entry)}
              style={{
                padding: 6,
                border: '2px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#e0e0e0'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              title={`${entry.label}（點擊放置）`}
            >
              <PiecePreview cells={cells} color={entry.color} />
              <span style={{ fontSize: 10, color: '#666' }}>{entry.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const rotateBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  backgroundColor: '#eee',
  border: '1px solid #ccc',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};
