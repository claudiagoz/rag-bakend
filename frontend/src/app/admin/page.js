'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '../../lib/api';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', slug: '', plan: 'EMPRENDEDORES', adminEmail: '', adminPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (!token || !savedUser) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(savedUser);
    if (parsedUser.role !== 'SUPERADMIN') {
      router.push('/dashboard');
      return;
    }

    setUser(parsedUser);
  }, []);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/superadmin/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la empresa');
      }

      setMessage(`Empresa "${data.name}" creada exitosamente.`);
      setFormData({ name: '', slug: '', plan: 'EMPRENDEDORES', adminEmail: '', adminPassword: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  if (!user) return <div className="loading-screen">Verificando accesos...</div>;

  return (
    <div className="admin-container animate-fade-in">
      <nav className="top-nav glass-panel">
        <div className="nav-brand">
          <span className="brand-name">Ragbase <span className="superadmin-badge">SUPER ADMIN</span></span>
        </div>
        <div className="nav-actions">
          <div className="user-profile">
            <span>{user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Salir</button>
          </div>
        </div>
      </nav>

      <main className="admin-content">
        <header className="page-header">
          <h1 className="page-title">Panel Global</h1>
          <p className="page-subtitle">Gestión central de clientes y cuentas (Tenants).</p>
        </header>

        <section className="creation-section glass-panel">
          <h2>Crear Nueva Empresa (Tenant)</h2>
          <p className="section-desc">Esto creará el espacio de trabajo, configurará la base de datos y generará el usuario administrador para el cliente.</p>

          {error && <div className="error-box">{error}</div>}
          {message && <div className="success-box">{message}</div>}

          <form onSubmit={handleCreateTenant} className="admin-form">
            <div className="form-grid">
              <div className="input-group">
                <label>Nombre de la Empresa</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Acme Corp"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label>Identificador Único (Slug)</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: acme"
                  value={formData.slug}
                  onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                />
              </div>

              <div className="input-group">
                <label>Plan de Uso</label>
                <select 
                  value={formData.plan}
                  onChange={e => setFormData({...formData, plan: e.target.value})}
                  className="custom-select"
                >
                  <option value="EMPRENDEDORES">Emprendedores ($150.000/mes)</option>
                  <option value="PYMES">Pymes ($300.000/mes)</option>
                </select>
              </div>
            </div>

            <h3 className="sub-heading">Credenciales del Administrador de la Empresa</h3>
            
            <div className="form-grid">
              <div className="input-group">
                <label>Email del Admin</label>
                <input 
                  type="email" 
                  required
                  placeholder="admin@acme.com"
                  value={formData.adminEmail}
                  onChange={e => setFormData({...formData, adminEmail: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label>Contraseña Provisional</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Temporal123"
                  value={formData.adminPassword}
                  onChange={e => setFormData({...formData, adminPassword: e.target.value})}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary create-btn" disabled={loading}>
              {loading ? 'Creando infraestructura...' : 'Crear Empresa y Cuenta'}
            </button>
          </form>
        </section>
      </main>

      <style jsx>{`
        .admin-container {
          min-height: 100vh;
        }

        .top-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          margin: 1rem;
          border-radius: var(--radius-md);
        }

        .brand-name {
          font-weight: 700;
          font-size: 1.25rem;
          color: white;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .superadmin-badge {
          background: linear-gradient(135deg, #FF4C4C, #FF8C4C);
          font-size: 0.75rem;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-sm);
          color: white;
          letter-spacing: 0.05em;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
          min-width: 0;
        }

        .user-profile span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 45vw;
        }

        .logout-btn {
          color: var(--danger);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .admin-content {
          padding: 2rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 2rem;
        }

        .page-title {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .page-subtitle {
          color: var(--text-secondary);
        }

        .creation-section {
          padding: 2.5rem;
        }

        .section-desc {
          color: var(--text-muted);
          margin-bottom: 2rem;
          margin-top: 0.5rem;
          font-size: 0.95rem;
        }

        .admin-form {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .input-group label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .input-group input, .custom-select {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          color: white;
          transition: all var(--transition-fast);
        }

        .input-group input:focus, .custom-select:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(102, 252, 241, 0.2);
        }

        .custom-select {
          appearance: none;
        }

        .custom-select option {
          background: var(--bg-surface);
          color: white;
        }

        .sub-heading {
          font-size: 1.1rem;
          color: var(--text-primary);
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 1.5rem;
          margin-top: 0.5rem;
        }

        .create-btn {
          align-self: flex-start;
          margin-top: 1rem;
        }

        .error-box {
          background: rgba(255, 76, 76, 0.1);
          color: var(--danger);
          padding: 1rem;
          border-radius: var(--radius-md);
          border: 1px solid rgba(255, 76, 76, 0.2);
          margin-bottom: 1.5rem;
        }

        .success-box {
          background: rgba(0, 230, 118, 0.1);
          color: var(--success);
          padding: 1rem;
          border-radius: var(--radius-md);
          border: 1px solid rgba(0, 230, 118, 0.2);
          margin-bottom: 1.5rem;
        }
      `}</style>
    </div>
  );
}
