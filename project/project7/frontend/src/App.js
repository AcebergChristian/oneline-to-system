import React, { useState, useCallback } from 'react';
import Game from './Game';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8007';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#00d2ff',
    textShadow: '0 0 10px rgba(0,210,255,0.5)',
  },
  scoreBoard: {
    display: 'flex',
    gap: '40px',
    fontSize: '1.2rem',
  },
  scoreLabel: { color: '#aaa' },
  scoreValue: { color: '#ffd700', fontWeight: 'bold' },
  highScoresBox: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '16px 24px',
    minWidth: '220px',
    border: '1px solid #0f3460',
  },
  highScoresTitle: {
    color: '#e94560',
    fontWeight: 'bold',
    marginBottom: '8px',
    textAlign: 'center',
  },
  scoreItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
    color: '#ccc',
  },
  rank: { color: '#888', marginRight: '8px' },
};

function App() {
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState([]);
  const [playerName, setPlayerName] = useState('玩家');
  const [showNameInput, setShowNameInput] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const fetchHighScores = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/scores`);
      const data = await res.json();
      setHighScores(data.high_scores || []);
    } catch {
      console.warn('无法获取排行榜');
    }
  }, []);

  const submitScore = useCallback(async (finalScore) => {
    try {
      await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, score: finalScore }),
      });
      fetchHighScores();
    } catch {
      console.warn('提交分数失败');
    }
  }, [playerName, fetchHighScores]);

  // Fetch scores on mount
  React.useEffect(() => {
    fetchHighScores();
  }, [fetchHighScores]);

  const handleScoreChange = (newScore) => {
    setScore(newScore);
  };

  const handleGameOver = (finalScore) => {
    setGameOver(true);
    submitScore(finalScore);
  };

  const handleRestart = () => {
    setScore(0);
    setGameOver(false);
    setShowNameInput(false);
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    setShowNameInput(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>🐍 贪吃蛇</div>

      <div style={styles.scoreBoard}>
        <div>
          <span style={styles.scoreLabel}>得分：</span>
          <span style={styles.scoreValue}>{score}</span>
        </div>
        <div>
          <span style={styles.scoreLabel}>长度：</span>
          <span style={styles.scoreValue}>{Math.max(0, score)}</span>
        </div>
      </div>

      <Game
        onScoreChange={handleScoreChange}
        onGameOver={handleGameOver}
        gameOver={gameOver}
        onRestart={handleRestart}
        playerName={playerName}
        setPlayerName={setPlayerName}
      />

      {showNameInput && (
        <form onSubmit={handleNameSubmit}>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="输入你的名字"
            style={{ padding: '8px', borderRadius: '6px', border: 'none' }}
            autoFocus
          />
          <button type="submit" style={{ marginLeft: '8px', padding: '8px 16px' }}>
            确认
          </button>
        </form>
      )}

      <div style={styles.highScoresBox}>
        <div style={styles.highScoresTitle}>🏆 排行榜 TOP 10</div>
        {highScores.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center' }}>暂无记录</div>
        )}
        {highScores.map((entry, i) => (
          <div key={i} style={styles.scoreItem}>
            <span>
              <span style={styles.rank}>{i + 1}.</span>
              {entry.name}
            </span>
            <span style={{ color: '#ffd700' }}>{entry.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;