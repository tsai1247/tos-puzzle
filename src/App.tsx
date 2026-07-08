import { useEffect, useRef } from 'react';
import { useGame } from './utils/GameContext';
import { GamePhase } from './types';
import EditPanel from './components/EditPanel';
import PuzzlePanel from './components/PuzzlePanel';
import Grid from './components/Grid';
import { decodeFromUrl } from './utils/urlShare';

function AppContent() {
  const { state, dispatch } = useGame();
  const { phase } = state;
  const hasLoadedUrl = useRef(false);

  // 啟動時檢查 URL 參數
  useEffect(() => {
    if (hasLoadedUrl.current) return;
    hasLoadedUrl.current = true;

    const params = new URLSearchParams(window.location.search);
    const shared = params.get('s');
    if (shared) {
      const data = decodeFromUrl(shared);
      if (data) {
        const boardName = params.get('n') || '分享版面';
        dispatch({ type: 'LOAD_STATE', gridSize: data.gridSize, grid: data.grid, placedPieces: data.placedPieces, boardName });
        dispatch({ type: 'SET_PHASE', phase: GamePhase.Puzzle });
        // 清除 URL 參數避免重複載入
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [dispatch]);

  return (
    <div style={{
      padding: 'clamp(8px, 2vw, 24px)',
      fontFamily: 'sans-serif',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(18px, 4vw, 22px)' }}>🧩 神魔之塔工作站拼圖攻略</h1>

      {phase === GamePhase.Edit && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Grid />
          </div>
          <div style={{ flex: '0 1 280px', minWidth: 200 }}>
            <EditPanel />
          </div>
        </div>
      )}

      {phase === GamePhase.Puzzle && (
        <PuzzlePanel />
      )}
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
