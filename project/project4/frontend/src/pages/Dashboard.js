import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  sidebar: {
    width: 220,
    background: '#1a1a2e',
    color: '#fff',
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column'
  },
  sidebarTitle: {
    padding: '0 20px',
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 32
  },
  navItem: {
    padding: '12px 20px',
    cursor: 'pointer',
    fontSize: 14,
    color: '#ccc',
    textDecoration: 'none',
    display: 'block',
    borderLeft: '3px solid transparent'
  },
  navItemActive: {
    padding: '12px 20px',
    cursor: 'pointer',
    fontSize: 14,
    color: '#fff',
    textDecoration: 'none',
    display: 'block',
    borderLeft: '3px solid #667eea',
    background: 'rgba(102,126,234,0.1)'
  },
  main: {
    flex: 1,
    padding: 32,
    background: '#f5f6fa'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a2e'
  },
  userInfo: {
    fontSize: 14,
    color: '#666'
  },
  logoutBtn: {
    marginLeft: 12,
    padding: '6px 16px',
    background: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 32
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 700,
    color: '#1a1a2e'
  },
  cardLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 4
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: 16
  },
  table: {
    width: '100%',
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #eee',
    background: '#fafafa'
  },
  td: {
    padding: '12px 16px',
    fontSize: 13,
    color: '#333',
    borderBottom: '1px solid #f5f5f5'
  },
  badge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500
  }
};

const statusColors = {
  open: { bg: '#e3f2fd', color: '#1976d2' },
  in_progress: { bg: '#fff3e0', color: '#f57c00' },
  resolved: { bg: '#e8f5e9', color: '#388e3c' },
  closed: { bg: '#f5f5f5', color: '#616161' }
};

const priorityColors = {
  low: { bg: '#e8f5e9', color: '#388e3c' },
  medium: { bg: '#e3f2fd', color: '#1976d2' },
  high: { bg: '#fff3e0', color: '#f57c00' },
  urgent: { bg: '#fce4ec', color: '#d32f2f' }
};

const statusLabels = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭'
};

const priorityLabels = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
    api.get('/api/dashboard').then(res => setData(res.data)).catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const isActive = (path) => window.location.pathname === path;

  return (
    <div style={styles.layout}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarTitle}>📋 工单系统</div>
        <Link to="/dashboard" style={isActive('/dashboard') ? styles.navItemActive : styles.navItem}>
          📊 仪表盘
        </Link>
        <Link to="/tickets" style={isActive('/tickets') ? styles.navItemActive : styles.navItem}>
          🎫 工单管理
        </Link>
      </div>
      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>仪表盘</div>
          <div style={styles.userInfo}>
            {user && <span>👤 {user.display_name} ({user.role === 'admin' ? '管理员' : '用户'})</span>}
            <button style={styles.logoutBtn} onClick={handleLogout}>退出登录</button>
          </div>
        </div>

        {data && (
          <>
            <div style={styles.grid}>
              <div style={styles.card}>
                <div style={styles.cardValue}>{data.total}</div>
                <div style={styles.cardLabel}>总工单</div>
              </div>
              <div style={styles.card}>
                <div style={{...styles.cardValue, color: '#1976d2'}}>{data.open_count}</div>
                <div style={styles.cardLabel}>待处理</div>
              </div>
              <div style={styles.card}>
                <div style={{...styles.cardValue, color: '#f57c00'}}>{data.in_progress}</div>
                <div style={styles.cardLabel}>处理中</div>
              </div>
              <div style={styles.card}>
                <div style={{...styles.cardValue, color: '#388e3c'}}>{data.resolved}</div>
                <div style={styles.cardLabel}>已解决</div>
              </div>
              <div style={styles.card}>
                <div style={{...styles.cardValue, color: '#d32f2f'}}>{data.urgent}</div>
                <div style={styles.cardLabel}>紧急工单</div>
              </div>
              <div style={styles.card}>
                <div style={{...styles.cardValue, color: '#f57c00'}}>{data.high}</div>
                <div style={styles.cardLabel}>高优先级</div>
              </div>
            </div>

            <div style={styles.sectionTitle}>📌 最近工单</div>
            <div style={styles.table}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>标题</th>
                    <th style={styles.th}>状态</th>
                    <th style={styles.th}>优先级</th>
                    <th style={styles.th}>创建人</th>
                    <th style={styles.th}>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_tickets.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={6} align="center">暂无工单</td>
                    </tr>
                  ) : (
                    data.recent_tickets.map(ticket => (
                      <tr key={ticket.id}>
                        <td style={styles.td}>#{ticket.id}</td>
                        <td style={styles.td}>{ticket.title}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            ...statusColors[ticket.status] || statusColors.open
                          }}>
                            {statusLabels[ticket.status] || ticket.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            ...priorityColors[ticket.priority] || priorityColors.medium
                          }}>
                            {priorityLabels[ticket.priority] || ticket.priority}
                          </span>
                        </td>
                        <td style={styles.td}>{ticket.creator}</td>
                        <td style={styles.td}>{new Date(ticket.created_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}