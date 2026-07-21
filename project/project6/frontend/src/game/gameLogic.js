// 1024 Game Logic – based on 2048 mechanics, win at 1024

const SIZE = 4;
const WIN_TILE = 1024;

// Initialize empty board
export function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

// Clone board
function cloneBoard(board) {
  return board.map(row => [...row]);
}

// Add a random tile (2 or 4) to an empty cell
export function addRandomTile(board) {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const newBoard = cloneBoard(board);
  newBoard[r][c] = Math.random() < 0.9 ? 2 : 4;
  return newBoard;
}

// Initialize game: 2 random tiles
export function initGame() {
  let board = createEmptyBoard();
  board = addRandomTile(board);
  board = addRandomTile(board);
  return board;
}

// Slide a single row left (returns { row, score, merged })
function slideRow(row) {
  // Remove zeros
  let tiles = row.filter(v => v !== 0);
  let score = 0;
  let merged = [];

  // Merge adjacent equal tiles
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] === tiles[i + 1]) {
      tiles[i] *= 2;
      score += tiles[i];
      tiles.splice(i + 1, 1);
      merged.push(true);
    } else {
      merged.push(false);
    }
  }
  merged.push(false); // remaining

  // Pad with zeros
  while (tiles.length < SIZE) {
    tiles.push(0);
    merged.push(false);
  }

  return { row: tiles, score, merged };
}

// Move board in a direction
export function move(board, direction) {
  const dirs = { left: 0, up: 1, right: 2, down: 3 };
  const d = dirs[direction];
  if (d === undefined) return { board, score: 0, moved: false };

  let newBoard = cloneBoard(board);
  let totalScore = 0;
  let moved = false;

  // For each line (row or column)
  for (let i = 0; i < SIZE; i++) {
    let line;
    if (d === 0) line = newBoard[i];               // left
    else if (d === 2) line = [...newBoard[i]].reverse(); // right
    else if (d === 1) line = newBoard.map(row => row[i]); // up
    else line = [...newBoard.map(row => row[i])].reverse(); // down

    const result = slideRow(line);
    totalScore += result.score;

    if (d === 0) newBoard[i] = result.row;
    else if (d === 2) newBoard[i] = result.row.reverse();
    else if (d === 1) {
      for (let r = 0; r < SIZE; r++) newBoard[r][i] = result.row[r];
    } else {
      for (let r = 0; r < SIZE; r++) newBoard[r][i] = result.row.reverse()[r];
    }
  }

  // Check if anything changed
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== newBoard[r][c]) {
        moved = true;
        break;
      }
    }
    if (moved) break;
  }

  return { board: newBoard, score: totalScore, moved };
}

// Check if game is won (has 1024 tile)
export function checkWin(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === WIN_TILE) return true;
    }
  }
  return false;
}

// Check if game is over (no moves left)
export function checkGameOver(board) {
  // Check for empty cells
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return false;
    }
  }
  // Check for possible merges
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const val = board[r][c];
      if (c + 1 < SIZE && board[r][c + 1] === val) return false;
      if (r + 1 < SIZE && board[r + 1][c] === val) return false;
    }
  }
  return true;
}

// Get max tile on board
export function getMaxTile(board) {
  let max = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] > max) max = board[r][c];
    }
  }
  return max;
}

// Tile color mapping
export function getTileStyle(value) {
  const colors = {
    0:    { bg: '#cdc1b4', color: '#776e65' },
    2:    { bg: '#eee4da', color: '#776e65' },
    4:    { bg: '#ede0c8', color: '#776e65' },
    8:    { bg: '#f2b179', color: '#f9f6f2' },
    16:   { bg: '#f59563', color: '#f9f6f2' },
    32:   { bg: '#f67c5f', color: '#f9f6f2' },
    64:   { bg: '#f65e3b', color: '#f9f6f2' },
    128:  { bg: '#edcf72', color: '#f9f6f2' },
    256:  { bg: '#edcc61', color: '#f9f6f2' },
    512:  { bg: '#edc850', color: '#f9f6f2' },
    1024: { bg: '#edc53f', color: '#f9f6f2' },
    2048: { bg: '#edc22e', color: '#f9f6f2' },
  };
  return colors[value] || { bg: '#3c3a32', color: '#f9f6f2' };
}

export { SIZE, WIN_TILE };