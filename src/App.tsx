import { useGame } from './utils/GameContext';
import { GamePhase } from './types';
import EditPanel from './components/EditPanel';
import PuzzlePanel from './components/PuzzlePanel';
import Grid from './components/Grid';

function AppContent() {
  const { state } = useGame();
  const { phase } = state;

  return (
    <div style={{
      padding: 'clamp(8px, 2vw, 24px)',
      fontFamily: 'sans-serif',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(18px, 4vw, 22px)' }}>🧩 拼圖遊戲</h1>

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
