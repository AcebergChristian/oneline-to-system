import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 36px',
    width: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 8
  },
  subtitle: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    marginBottom: 32
  },
  inputGroup: {
    marginBottom: 20
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
    marginBottom: 6
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s'
  },
  button: {
    width: '100%',
    padding: '12px 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8
  },
  error: {
    color: '#e74c3c',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    padding: '8px 12px',
    background: '#fdf0ef',
    borderRadius: 6
  }
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/login', { username, password });
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify({
        username: res.data.username,
        role: res.data.role,
        display_name: res.data.display_name
      }));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>工单管理系统</div>
        <div style={styles.subtitle}>请登录以继续</div>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>用户名</label>
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>密码</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#aaa' }}>
          默认账号: admin / admin123
        </div>
      </div>
    </div>
  );
}