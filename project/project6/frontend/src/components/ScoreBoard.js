import React from 'react';

export default function ScoreBoard({ score, bestScore, maxTile, recentScores }) {
  return (
    <div className="scoreboard">
      <div className="score-panel">
        <div className="score-box">
          <span className="score-label">分数</span>
          <span className="score-value">{score}</span>
        </div>
        <div className="score-box">
          <span className="score-label">最高分</span>
          <span className="score-value">{bestScore}</span>
        </div>
        <div className="score-box">
          <span className="score-label">最大方块</span>
          <span className="score-value">{maxTile}</span>
        </div>
      </div>

      <div className="top-scores">
        <h3>历史最高分</h3>
        {recentScores.length === 0 ? (
          <p className="no-scores">暂无记录</p>
        ) : (
          <ul>
            {recentScores.map((s, i) => (
              <li key={i}>
                <span className="hist-score">{s.score}</span>
                <span className="hist-tile">最大: {s.max_tile}</span>
                {s.won ? <span className="hist-won">🏆</span> : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}