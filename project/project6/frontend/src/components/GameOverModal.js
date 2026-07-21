import React from 'react';

export default function GameOverModal({ won, score, maxTile, onRestart }) {
  return (
    <div className="modal-overlay">
      <div className={`modal ${won ? 'modal-won' : 'modal-lost'}`}>
        <div className="modal-icon">
          {won ? '🎉' : '😵'}
        </div>
        <h2 className="modal-title">
          {won ? '恭喜通关！' : '游戏结束'}
        </h2>
        <p className="modal-subtitle">
          {won
            ? `你成功拼出了 1024！`
            : `棋盘已满，无法继续移动`}
        </p>
        <div className="modal-stats">
          <div className="modal-stat">
            <span className="stat-label">得分</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="modal-stat">
            <span className="stat-label">最大方块</span>
            <span className="stat-value">{maxTile}</span>
          </div>
        </div>
        <button className="restart-btn" onClick={onRestart}>
          再来一局
        </button>
      </div>
    </div>
  );
}