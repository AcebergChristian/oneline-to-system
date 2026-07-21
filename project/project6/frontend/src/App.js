import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameBoard from './components/GameBoard';
import ScoreBoard from './components/ScoreBoard';
import GameOverModal from './components/GameOverModal';
import {
  initGame,
  move,
  addRandomTile,
  checkWin,
  checkGameOver,
  getMaxTile,
  WIN_TILE,
} from './game/gameLogic';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function App() {
  const [board, setBoard] = useState(() => initGame());
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [recentScores, setRecentScores] = useState([]);
  const [saving, setSaving] = useState(false);
  const gameEndedRef = useRef(false);

  // Fetch top scores on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/scores`)
      .then(res => res.json())
      .then(data => setRecentScores(data.scores || []))
      .catch(() => {});
  }, []);

  // Save score when game ends
  const saveScore = useCallback(async (finalScore, maxTile, isWin) => {
    if (saving) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore, max_tile: maxTile, won: isWin }),
      });
      // Refresh scores
      const res = await fetch(`${API_BASE}/api/scores`);
      if (res.ok) {
        const data = await res.json();
        setRecentScores(data.scores || []);
      }
    } catch (e) {
      // offline ok
    }
    setSaving(false);
  }, [saving]);

  // End game
  const endGame = useCallback((currentBoard, currentScore) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;

    const isWin = checkWin(currentBoard);
    const maxTile = getMaxTile(currentBoard);
    setWon(isWin);
    setGameOver(true);
    saveScore(currentScore, maxTile, isWin);
  }, [saveScore]);

  // Handle keyboard move
  const handleKey = useCallback((e) => {
    if (gameOver) return;

    const keyMap = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const dir = keyMap[e.key];
    if (!dir) return;
    e.preventDefault();

    const result = move(board, dir);
    if (!result.moved) return;

    const newBoard = addRandomTile(result.board);
    const newScore = score + result.score;

    setBoard(newBoard);
    setScore(newScore);
    if (newScore > bestScore) setBestScore(newScore);

    // Check win
    if (checkWin(newBoard)) {
      endGame(newBoard, newScore);
    } else if (checkGameOver(newBoard)) {
      endGame(newBoard, newScore);
    }
  }, [board, score, bestScore, gameOver, endGame]);

  // Touch support for mobile
  const touchStart = useRef(null);
  const handleTouchStart = useCallback((e) => {
    if (gameOver) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, [gameOver]);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStart.current || gameOver) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 30) return; // min swipe distance

    let dir;
    if (absDx > absDy) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }

    // Simulate key event
    const keyMap = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
    handleKey({ key: keyMap[dir], preventDefault: () => {} });
  }, [gameOver, handleKey]);

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Restart game
  const restart = useCallback(() => {
    gameEndedRef.current = false;
    setBoard(initGame());
    setScore(0);
    setGameOver(false);
    setWon(false);
  }, []);

  return (
    <div
      className="app"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <h1 className="title">1024</h1>
      <p className="subtitle">用方向键或滑动来合并方块，目标：1024！</p>

      <div className="game-container">
        <div className="game-area">
          <GameBoard board={board} />
          <div className="controls">
            <button className="new-game-btn" onClick={restart}>
              新游戏
            </button>
          </div>
        </div>

        <ScoreBoard
          score={score}
          bestScore={bestScore}
          maxTile={getMaxTile(board)}
          recentScores={recentScores}
        />
      </div>

      {gameOver && (
        <GameOverModal
          won={won}
          score={score}
          maxTile={getMaxTile(board)}
          onRestart={restart}
        />
      )}
    </div>
  );
}