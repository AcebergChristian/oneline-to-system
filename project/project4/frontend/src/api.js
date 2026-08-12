import axios from 'axios';

function resolveApiBase() {
  const configured = process.env.REACT_APP_API_URL || '';
  if (configured) {
    try {
      const parsed = new URL(configured);
      if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        parsed.protocol = window.location.protocol;
        parsed.hostname = window.location.hostname;
        return parsed.toString().replace(/\/$/, '');
      }
      return configured.replace(/\/$/, '');
    } catch {
      return configured.replace(/\/$/, '');
    }
  }
  return `${window.location.protocol}//${window.location.hostname}:8004`;
}

const api = axios.create({
  baseURL: resolveApiBase(),
  headers: { 'Content-Type': 'application/json' }
});

// 请求拦截器：自动添加token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
