import React, { useRef, useEffect, useState, useCallback } from 'react';

const GRID_SIZE = 20;       // 20x20 grid
const CELL_SIZE = 22;       // pixels per cell
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const TICK_INTERVAL_MS = 150;

const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

function randomFood(snake) {
  const snakeSet = new Set(snake.map((c) => `${c.x},${c.y}`));
  const free = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!snakeSet.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function Game({ onScoreChange, onGameOver, gameOver, onRestart, playerName }) {
  const canvasRef = useRef(null);
  const [snake, setSnake] = useState(() => [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]);
  const [food, setFood] = useState(null);
  const [direction, setDirection] = useState(DIRECTIONS.RIGHT);
  const [nextDirection, setNextDirection] = useState(DIRECTIONS.RIGHT);
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const gameLoopRef = useRef(null);
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const dirRef = useRef(direction);
  const nextDirRef = useRef(nextDirection);
  const scoreRef = useRef(score);
  const gameOverRef = useRef(gameOver);

  // Keep refs in sync
  useEffect(() => { snakeRef.current = snake; }, [snake]);
  useEffect(() => { foodRef.current = food; }, [food]);
  useEffect(() => { dirRef.current = direction; }, [direction]);
  useEffect(() => { nextDirRef.current = nextDirection; }, [nextDirection]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  // Initialize food
  useEffect(() => {
    if (!food) {
      const f = randomFood(snake);
      setFood(f);
      foodRef.current = f;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e) => {
      if (gameOverRef.current) return;
      const keyMap = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        w: 'UP',
        s: 'DOWN',
        a: 'LEFT',
        d: 'RIGHT',
      };
      const dirName = keyMap[e.key];
      if (!dirName) return;
      e.preventDefault();
      const newDir = DIRECTIONS[dirName];
      const current = dirRef.current;
      // Prevent reversing direction
      if (current.x + newDir.x === 0 && current.y + newDir.y === 0) return;
      nextDirRef.current = newDir;
      setNextDirection(newDir);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Game loop
  const tick = useCallback(() => {
    if (gameOverRef.current) return;

    // Apply queued direction
    dirRef.current = nextDirRef.current;
    const dir = dirRef.current;
    const currentSnake = snakeRef.current;
    const currentFood = foodRef.current;

    const head = currentSnake[0];
    const newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      onGameOver(scoreRef.current);
      return;
    }

    // Self collision (check against body except tail since we'll remove it)
    const bodyWithoutTail = currentSnake.slice(0, -1);
    if (bodyWithoutTail.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
      onGameOver(scoreRef.current);
      return;
    }

    const ate = currentFood && newHead.x === currentFood.x && newHead.y === currentFood.y;
    const newSnake = [newHead, ...currentSnake];
    if (!ate) {
      newSnake.pop(); // remove tail
    }

    let newFood = currentFood;
    let newScore = scoreRef.current;

    if (ate) {
      newScore += 1;
      newFood = randomFood(newSnake);
      if (!newFood) {
        // Win condition — filled the grid!
        onGameOver(newScore);
        return;
      }
    }

    snakeRef.current = newSnake;
    foodRef.current = newFood;
    scoreRef.current = newScore;

    setSnake(newSnake);
    setFood(newFood);
    setScore(newScore);
    setDirection(dir);
    onScoreChange(newScore);
  }, [onScoreChange, onGameOver]);

  // Start/Stop game loop
  useEffect(() => {
    if (isRunning && !gameOver) {
      gameLoopRef.current = setInterval(tick, TICK_INTERVAL_MS);
    }
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [isRunning, gameOver, tick]);

  // Draw canvas
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Background
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines
    ctx.strokeStyle = '#1a1a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    // Snake
    const currentSnake = snakeRef.current;
    currentSnake.forEach((seg, i) => {
      const isHead = i === 0;
      ctx.fillStyle = isHead ? '#00ff88' : '#00d2ff';
      ctx.shadowColor = isHead ? '#00ff88' : '#00d2ff';
      ctx.shadowBlur = isHead ? 12 : 6;
      ctx.fillRect(seg.x * CELL_SIZE + 1, seg.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      ctx.shadowBlur = 0;
    });

    // Food
    if (foodRef.current) {
      const f = foodRef.current;
      ctx.fillStyle = '#ff4757';
      ctx.shadowColor = '#ff4757';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(
        f.x * CELL_SIZE + CELL_SIZE / 2,
        f.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (gameOverRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('游戏结束', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 10);
      ctx.fillStyle = '#ffd700';
      ctx.font = '18px sans-serif';
      ctx.fillText(`得分: ${scoreRef.current}`, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 30);
    }
  });

  const handleStart = () => {
    if (gameOver) {
      onRestart();
      // Reset state
      const initialSnake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ];
      setSnake(initialSnake);
      snakeRef.current = initialSnake;
      setDirection(DIRECTIONS.RIGHT);
      dirRef.current = DIRECTIONS.RIGHT;
      setNextDirection(DIRECTIONS.RIGHT);
      nextDirRef.current = DIRECTIONS.RIGHT;
      setScore(0);
      scoreRef.current = 0;
      const f = randomFood(initialSnake);
      setFood(f);
      foodRef.current = f;
      setIsRunning(false);
      // Small delay then start
      setTimeout(() => setIsRunning(true), 100);
    } else {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  };

  const btnStyle = {
    padding: '10px 24px',
    fontSize: '1rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: '0.2s',
  };

  return (
    <div style={containerStyle}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          border: '2px solid #00d2ff',
          borderRadius: '8px',
          boxShadow: '0 0 20px rgba(0,210,255,0.3)',
        }}
        tabIndex="0"
      />
      <div style={{ display: 'flex', gap: '12px' }}>
        {!isRunning && !gameOver && (
          <button
            onClick={handleStart}
            style={{ ...btnStyle, background: '#00d2ff', color: '#1a1a2e' }}
          >
            ▶ 开始游戏
          </button>
        )}
        {isRunning && (
          <button
            onClick={handlePause}
            style={{ ...btnStyle, background: '#e94560', color: '#fff' }}
          >
            ⏸ 暂停
          </button>
        )}
        {gameOver && (
          <button
            onClick={handleStart}
            style={{ ...btnStyle, background: '#ffd700', color: '#1a1a2e' }}
          >
            🔄 重新开始
          </button>
        )}
      </div>
      <div style={{ color: '#888', fontSize: '0.85rem' }}>
        {isRunning ? '方向键 / WASD 控制方向' : '点击开始按钮开始游戏'}
      </div>
    </div>
  );
}

export default Game;