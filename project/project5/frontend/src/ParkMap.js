import React, { useState } from 'react';

export default function ParkMap({ parkData, onSelectBuilding, onSelectPoint }) {
  const [selectedBldId, setSelectedBldId] = useState(null);
  const [selectedPtId, setSelectedPtId] = useState(null);
  const [hoveredBld, setHoveredBld] = useState(null);

  const handleBuildingClick = (b) => {
    setSelectedBldId(b.id);
    setSelectedPtId(null);
    onSelectBuilding(b);
  };

  const handlePointClick = (e, bld, pt) => {
    e.stopPropagation();
    setSelectedPtId(pt.id);
    setSelectedBldId(bld.id);
    onSelectPoint(pt);
  };

  // 计算 SVG 尺寸
  const padding = 60;
  const maxX = Math.max(...parkData.buildings.map(b => b.x + b.width)) + padding;
  const maxY = Math.max(...parkData.buildings.map(b => b.y + b.height)) + padding;

  return (
    <div className="map-container">
      <svg width={maxX} height={maxY} viewBox={`0 0 ${maxX} ${maxY}`}>
        {/* 背景 */}
        <rect x="0" y="0" width={maxX} height={maxY} fill="rgba(0,20,50,0.3)" rx="12" />

        {/* 园区标题 */}
        <text x={maxX / 2} y={30} textAnchor="middle" fill="#00d4ff" fontSize="16" fontWeight="600">
          {parkData.name}
        </text>

        {/* 道路 */}
        {parkData.roads && parkData.roads.map((r, i) => (
          <line
            key={`road-${i}`}
            x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            className="road-line"
          />
        ))}

        {/* 楼宇 */}
        {parkData.buildings.map(b => {
          const isSelected = selectedBldId === b.id;
          const isHovered = hoveredBld === b.id;
          const hasWarning = b.sensors.some(s => s.status === 'warning');
          const fillColor = isSelected ? '#00e5ff' : (hasWarning ? '#ffa726' : b.color);
          const opacity = isSelected ? 0.9 : (isHovered ? 0.85 : 0.7);

          return (
            <g key={b.id}>
              <rect
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                rx={6}
                fill={fillColor}
                opacity={opacity}
                className={`building-rect ${isSelected ? 'selected' : ''}`}
                onClick={() => handleBuildingClick(b)}
                onMouseEnter={() => setHoveredBld(b.id)}
                onMouseLeave={() => setHoveredBld(null)}
              />
              {/* 楼宇名称 */}
              <text
                x={b.x + b.width / 2}
                y={b.y + b.height / 2 - 6}
                className="building-label"
                onClick={() => handleBuildingClick(b)}
              >
                {b.name}
              </text>
              {/* 传感器摘要 */}
              <text
                x={b.x + b.width / 2}
                y={b.y + b.height / 2 + 14}
                textAnchor="middle"
                fill="#8ab4f8"
                fontSize="11"
                pointerEvents="none"
              >
                {b.sensors.map(s => s.value).join(' | ')}
              </text>
              {/* 点位标记 */}
              {b.points.map(pt => (
                <g
                  key={pt.id}
                  className={`point-marker ${selectedPtId === pt.id ? 'selected' : ''}`}
                  onClick={(e) => handlePointClick(e, b, pt)}
                >
                  <circle
                    cx={b.x + pt.x}
                    cy={b.y + pt.y}
                    r={6}
                    fill={selectedPtId === pt.id ? '#00e5ff' : '#66bb6a'}
                    stroke="#fff"
                    strokeWidth={1.5}
                    opacity={0.9}
                  />
                  <text
                    x={b.x + pt.x}
                    y={b.y + pt.y - 10}
                    textAnchor="middle"
                    fill="#e0e6ed"
                    fontSize="10"
                    pointerEvents="none"
                  >
                    {pt.name}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}