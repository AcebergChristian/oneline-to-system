import React from 'react';

export default function SensorDetail({ point, buildingName, onBack, onBackToPark }) {
  return (
    <div className="building-interior">
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 8 }}>
        <button className="back-btn" onClick={onBack}>← 返回楼宇</button>
        <button className="back-btn" onClick={onBackToPark}>← 返回园区</button>
      </div>
      <div className="floor-plan" style={{ maxWidth: 500 }}>
        <h3>📍 {point.name}</h3>
        <p style={{ textAlign: 'center', color: '#8ab4f8', fontSize: 13, marginBottom: 20 }}>
          所属：{buildingName}
        </p>
        <div className="sensor-grid" style={{ gridTemplateColumns: '1fr' }}>
          {point.sensors.map(s => (
            <div key={s.id} className="sensor-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="sensor-name">{s.name}</div>
                <div className={`sensor-value ${s.status === 'warning' ? 'warning' : ''}`}>
                  {s.value}
                  <span className="sensor-unit">{s.unit}</span>
                </div>
              </div>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: s.status === 'warning' ? '#ffa726' : '#66bb6a',
                boxShadow: s.status === 'warning' ? '0 0 10px #ffa726' : '0 0 10px #66bb6a'
              }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}