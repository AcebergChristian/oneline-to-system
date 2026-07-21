import React from 'react';

export default function BuildingInterior({ building, onSelectPoint, onBack }) {
  return (
    <div className="building-interior">
      <button className="back-btn" onClick={onBack}>← 返回园区</button>
      <div className="floor-plan">
        <h3>🏢 {building.name} — 内部点位</h3>
        <div className="floor-grid">
          {building.points.map(pt => {
            const hasWarning = pt.sensors.some(s => s.status === 'warning');
            return (
              <div
                key={pt.id}
                className="point-card"
                onClick={() => onSelectPoint(pt)}
              >
                <h4>
                  {hasWarning ? '⚠ ' : '📍 '}
                  {pt.name}
                </h4>
                {pt.sensors.map(s => (
                  <div key={s.id} className="sensor-row">
                    <span className="label">{s.name}</span>
                    <span className={`value ${s.status === 'warning' ? 'warning' : ''}`}>
                      {s.value}{s.unit}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}