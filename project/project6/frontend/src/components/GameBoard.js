import React from 'react';
import { getTileStyle, SIZE } from '../game/gameLogic';

export default function GameBoard({ board }) {
  return (
    <div className="board">
      <div className="grid">
        {board.map((row, r) =>
          row.map((cell, c) => {
            const style = getTileStyle(cell);
            return (
              <div
                key={`${r}-${c}`}
                className="tile"
                style={{
                  backgroundColor: style.bg,
                  color: style.color,
                }}
              >
                {cell !== 0 && (
                  <span className="tile-value">{cell}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}