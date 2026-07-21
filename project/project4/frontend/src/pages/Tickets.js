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
    marginBottom: 24
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
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    gap: 8,
    alignItems: 'center'
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 13,
    background: '#fff'
  },
  addBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer'
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
  },
  actionBtn: {
    padding: '4px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    marginRight: 4
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    padding: '32px',
    width: 500,
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 20
  },
  formGroup: {
    marginBottom: 16
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
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    outline: 'none',
    minHeight: 80,
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20
  },
  cancelBtn: {
    padding: '10px 24px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14
  },
  saveBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer'
  },
  deleteBtn: {
    padding: '4px 12px',
    border: '1px solid #e74c3c',
    borderRadius: 6,
    background: '#fff',
    color: '#e74c3c',
    cursor: 'pointer',
    fontSize: 12
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20
  },
  pageBtn: {
    padding: '6px 14px',
    border: '1px solid #ddd',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13
  },
  pageBtnActive: {
    padding: '6px 14px',
    border: '1px solid #667eea',
    borderRadius: 6,
    background: '#667eea',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13
  },
  pageInfo: {
    fontSize: 13,
    color: '#888'
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

export default function Tickets() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTicket, setEditTicket] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });

  const pageSize = 10;

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [page, statusFilter, priorityFilter]);

  const fetchTickets = async () => {
    try {
      const params = { page, page_size: pageSize };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const res = await api.get('/api/tickets', { params });
      setTickets(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const isActive = (path) => window.location.pathname === path;

  const openCreate = () => {
    setEditTicket(null);
    setForm({ title: '', description: '', priority: 'medium' });
    setShowModal(true);
  };

  const openEdit = (ticket) => {
    setEditTicket(ticket);
    setForm({
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editTicket) {
        await api.put(`/api/tickets/${editTicket.id}`, form);
      } else {
        await api.post('/api/tickets', form);
      }
      setShowModal(false);
      fetchTickets();
    } catch (err) {
      alert('操作失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此工单吗？')) return;
    try {
      await api.delete(`/api/tickets/${id}`);
      fetchTickets();
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleStatusChange = async (ticket, newStatus) => {
    try {
      await api.put(`/api/tickets/${ticket.id}`, { status: newStatus });
      fetchTickets();
    } catch (err) {
      alert('更新失败');
    }
  };

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
          <div style={styles.headerTitle}>工单管理</div>
          <div style={styles.userInfo}>
            {user && <span>👤 {user.display_name} ({user.role === 'admin' ? '管理员' : '用户'})</span>}
            <button style={styles.logoutBtn} onClick={handleLogout}>退出登录</button>
          </div>
        </div>

        <div style={styles.toolbar}>
          <div style={styles.filterGroup}>
            <select style={styles.select} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">全部状态</option>
              <option value="open">待处理</option>
              <option value="in_progress">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
            <select style={styles.select} value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}>
              <option value="">全部优先级</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <button style={styles.addBtn} onClick={openCreate}>+ 新建工单</button>
        </div>

        <div style={styles.table}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>标题</th>
                <th style={styles.th}>状态</th>
                <th style={styles.th}>优先级</th>
                <th style={styles.th}>创建人</th>
                <th style={styles.th}>负责人</th>
                <th style={styles.th}>创建时间</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td style={{ ...styles.td, padding: '32px 0', color: '#888', textAlign: 'center' }} colSpan={8}>
                    暂无工单数据
                  </td>
                </tr>
              ) : (
                tickets.map(ticket => (
                  <tr key={ticket.id}>
                    <td style={styles.td}>#{ticket.id}</td>
                    <td style={styles.td}><strong>{ticket.title}</strong></td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...statusColors[ticket.status] || statusColors.open }}>
                        {statusLabels[ticket.status] || ticket.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...priorityColors[ticket.priority] || priorityColors.medium }}>
                        {priorityLabels[ticket.priority] || ticket.priority}
                      </span>
                    </td>
                    <td style={styles.td}>{ticket.creator}</td>
                    <td style={styles.td}>{ticket.assignee || '-'}</td>
                    <td style={styles.td}>{new Date(ticket.created_at).toLocaleString()}</td>
                    <td style={styles.td}>
                      <button style={styles.actionBtn} onClick={() => openEdit(ticket)}>编辑</button>
                      {ticket.status === 'open' && (
                        <button style={styles.actionBtn} onClick={() => handleStatusChange(ticket, 'in_progress')}>开始处理</button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <button style={styles.actionBtn} onClick={() => handleStatusChange(ticket, 'resolved')}>标记解决</button>
                      )}
                      {ticket.status === 'resolved' && (
                        <button style={styles.actionBtn} onClick={() => handleStatusChange(ticket, 'closed')}>关闭</button>
                      )}
                      {user && user.role === 'admin' && (
                        <button style={styles.deleteBtn} onClick={() => handleDelete(ticket.id)}>删除</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              style={styles.pageBtn}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >上一页</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  style={pageNum === page ? styles.pageBtnActive : styles.pageBtn}
                  onClick={() => setPage(pageNum)}
                >{pageNum}</button>
              );
            })}
            <button
              style={styles.pageBtn}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >下一页</button>
            <span style={styles.pageInfo}>共 {total} 条</span>
          </div>
        )}
      </div>

      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>{editTicket ? '编辑工单' : '新建工单'}</div>
            <div style={styles.formGroup}>
              <label style={styles.label}>标题</label>
              <input
                style={styles.input}
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="请输入工单标题"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>描述</label>
              <textarea
                style={styles.textarea}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="请输入工单描述"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>优先级</label>
              <select
                style={styles.input}
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </select>
            </div>
            {editTicket && (
              <div style={styles.formGroup}>
                <label style={styles.label}>状态</label>
                <select
                  style={styles.input}
                  value={form.status || editTicket.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                >
                  <option value="open">待处理</option>
                  <option value="in_progress">处理中</option>
                  <option value="resolved">已解决</option>
                  <option value="closed">已关闭</option>
                </select>
              </div>
            )}
            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setShowModal(false)}>取消</button>
              <button style={styles.saveBtn} onClick={handleSave}>
                {editTicket ? '保存修改' : '创建工单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}