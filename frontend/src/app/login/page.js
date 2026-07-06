'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '../../lib/api';

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '', tenantSlug: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      // Guardar token en localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('tenant', JSON.stringify(data.tenant));

      if (data.user.role === 'SUPERADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container animate-fade-in">
      <div className="login-card glass-panel">
        <h2 className="login-title">Bienvenido de nuevo</h2>
        <p className="login-subtitle">Ingresá tus datos para acceder</p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>Workspace (Slug de Empresa)</label>
            <input 
              type="text" 
              placeholder="Ej: acme"
              value={formData.tenantSlug}
              onChange={e => setFormData({...formData, tenantSlug: e.target.value})}
              required
            />
          </div>
          
          <div className="input-group">
            <label>Correo Electrónico</label>
            <input 
              type="email" 
              placeholder="tu@email.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="input-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>

          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'Validando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, rgba(69, 162, 158, 0.15) 0%, rgba(11, 12, 16, 1) 100%);
          padding: 2rem;
        }
        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 2.5rem 2rem;
        }
        .login-title {
          font-size: 1.75rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        .login-subtitle {
          color: var(--text-secondary);
          text-align: center;
          margin-bottom: 2rem;
          font-size: 0.95rem;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
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
        .input-group input {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          color: white;
          transition: border-color var(--transition-fast);
        }
        .input-group input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(102, 252, 241, 0.2);
        }
        .login-btn {
          margin-top: 1rem;
          width: 100%;
          padding: 0.85rem;
        }
        .error-box {
          background: rgba(255, 76, 76, 0.1);
          color: var(--danger);
          padding: 0.75rem;
          border-radius: var(--radius-md);
          border: 1px solid rgba(255, 76, 76, 0.2);
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
