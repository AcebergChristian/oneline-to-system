import React, { useState, useEffect, useCallback } from 'react';
import ParkMap from './ParkMap';
import BuildingInterior from './BuildingInterior';
import SensorDetail from './SensorDetail';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8005';

export default function App() {
  const [parkData, setParkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('park'); // 'park' | 'building' | 'point'
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [timeStr, setTimeStr] = useState('');

  // 实时时钟
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleString('zh-CN', { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // 加载园区数据
  useEffect(() => {
    fetch(`${API_BASE}/api/park`)
      .then(r => r.json())
      .then(data => {
        setParkData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('数据加载失败', err);
        setLoading(false);
      });
  }, []);

  const handleSelectBuilding = useCallback((building) => {
    setSelectedBuilding(building);
    setSelectedPoint(null);
    setView('building');
  }, []);

  const handleSelectPoint = useCallback((point) => {
    setSelectedPoint(point);
    setView('point');
  }, []);

  const handleBackToPark = useCallback(() => {
    setSelectedBuilding(null);
    setSelectedPoint(null);
    setView('park');
  }, []);

  const handleBackToBuilding = useCallback(() => {
    setSelectedPoint(null);
    setView('building');
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="header"><h1>智慧园区监控大屏</h1></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8ab4f8' }}>
          加载中...
        </div>
      </div>
    );
  }

  if (!parkData) {
    return (
      <div className="dashboard">
        <div className="header"><h1>智慧园区监控大屏</h1></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350' }}>
          数据加载失败，请检查后端服务
        </div>
      </div>
    );
  }

  // 计算统计
  const totalBuildings = parkData.buildings.length;
  const totalPoints = parkData.buildings.reduce((sum, b) => sum + b.points.length, 0);
  const totalSensors = parkData.buildings.reduce((sum, b) => sum + b.sensors.length, 0);
  const warningCount = parkData.buildings.reduce((sum, b) =>
    sum + b.sensors.filter(s => s.status === 'warning').length, 0
  );

  return (
    <div className="dashboard">
      {/* 头部 */}
      <div className="header">
        <h1>🏭 智慧园区监控大屏</h1>
        <div className="header-time">{timeStr}</div>
      </div>

      {/* 面包屑 */}
      <div className="breadcrumb">
        <a onClick={handleBackToPark}>园区总览</a>
        {selectedBuilding && (
          <>
            <span className="sep">›</span>
            <a onClick={handleBackToBuilding}>{selectedBuilding.name}</a>
          </>
        )}
        {selectedPoint && (
          <>
            <span className="sep">›</span>
            <span className="current">{selectedPoint.name}</span>
          </>
        )}
      </div>

      <div className="main-content">
        {/* 左侧面板 */}
        <div className="side-panel">
          <h2>📊 园区概览</h2>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-number">{totalBuildings}</div>
              <div className="stat-label">楼宇</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{totalPoints}</div>
              <div className="stat-label">点位</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{totalSensors}</div>
              <div className="stat-label">传感器</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" style={{ color: warningCount > 0 ? '#ffa726' : '#66bb6a' }}>{warningCount}</div>
              <div className="stat-label">告警</div>
            </div>
          </div>

          <h2>🏢 楼宇列表</h2>
          <div className="building-list">
            {parkData.buildings.map(b => {
              const hasWarning = b.sensors.some(s => s.status === 'warning');
              return (
                <div
                  key={b.id}
                  className="building-list-item"
                  onClick={() => handleSelectBuilding(b)}
                >
                  <div className="bld-name">{b.name}</div>
                  <div className={`bld-status ${hasWarning ? 'warning' : 'normal'}`}>
                    {hasWarning ? '⚠ 告警' : '✓ 正常'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 主内容区 */}
        <div className="map-area">
          {view === 'park' && (
            <ParkMap
              parkData={parkData}
              onSelectBuilding={handleSelectBuilding}
              onSelectPoint={handleSelectPoint}
            />
          )}
          {view === 'building' && selectedBuilding && (
            <BuildingInterior
              building={selectedBuilding}
              onSelectPoint={handleSelectPoint}
              onBack={handleBackToPark}
            />
          )}
          {view === 'point' && selectedPoint && selectedBuilding && (
            <SensorDetail
              point={selectedPoint}
              buildingName={selectedBuilding.name}
              onBack={handleBackToBuilding}
              onBackToPark={handleBackToPark}
            />
          )}
        </div>
      </div>
    </div>
  );
}