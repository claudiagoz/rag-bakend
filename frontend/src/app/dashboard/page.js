'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { API_URL } from '../../lib/api';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

const STATUS_LABELS = {
  TRIALING: 'Período de prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Pago rechazado',
  CANCELLED: 'Cancelada',
  PAUSED: 'Pausada',
};

const DOC_STATUS_LABELS = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  INDEXED: 'Indexado',
  FAILED: 'Error',
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [stats, setStats] = useState({ usage: 0, limit: 0, plan: '' });
  const [billing, setBilling] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchData = async (token) => {
    try {
      const resUsage = await fetch(`${API_URL}/api/usage`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resUsage.ok) {
        setStats(await resUsage.json());
      }

      const resBilling = await fetch(`${API_URL}/api/billing/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resBilling.ok) {
        setBilling(await resBilling.json());
      }

      const resDocs = await fetch(`${API_URL}/api/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resDocs.ok) {
        setDocuments(await resDocs.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedTenant = localStorage.getItem('tenant');

    if (!token || !savedUser) {
      router.push('/login');
      return;
    }

    setUser(JSON.parse(savedUser));
    setTenant(JSON.parse(savedTenant));
    fetchData(token);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  const handleCancelSubscription = async () => {
    if (!confirm('¿Seguro que querés cancelar tu suscripción? Vas a perder el acceso cuando termine el período ya pago.')) {
      return;
    }
    setCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/billing/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setBilling(prev => ({ ...prev, subscriptionStatus: 'CANCELLED' }));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No pudimos cancelar la suscripción. Intentá de nuevo.');
      }
    } catch (err) {
      console.error(err);
      alert('No pudimos cancelar la suscripción. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteDocument = async (docId, docName) => {
    if (!confirm(`¿Eliminar "${docName}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(docId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No pudimos eliminar el documento. Intentá de nuevo.');
      }
    } catch (err) {
      console.error(err);
      alert('No pudimos eliminar el documento. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setDeletingId(null);
    }
  };

  const trialDaysLeft = billing?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(billing.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  if (loading) {
    return <div className="loading-screen">Cargando panel...</div>;
  }

  return (
    <div className={`dash ${mono.variable}`}>
      <nav className="dash-nav">
        <div className="nav-brand">
          <span className="brand-name">Ragbase</span>
          <span className="tenant-badge">{tenant?.name}</span>
        </div>
        <div className="nav-actions">
          <Link href="/chat" className="btn-outline">Probar chatbot</Link>
          <div className="user-profile">
            <span className="user-email">{user?.email}</span>
            <button onClick={handleLogout} className="logout-btn">Salir</button>
          </div>
        </div>
      </nav>

      <main className="dash-content">
        <header className="page-header">
          <h1 className={`page-title ${serif.className}`}>Panel de control</h1>
          <p className="page-subtitle">Gestioná tus documentos y el uso del asistente.</p>
        </header>

        {billing && billing.subscriptionStatus !== 'ACTIVE' && (
          <div className={`billing-banner billing-${billing.subscriptionStatus.toLowerCase()}`}>
            <div>
              <p className="billing-status">{STATUS_LABELS[billing.subscriptionStatus] ?? billing.subscriptionStatus}</p>
              {billing.subscriptionStatus === 'TRIALING' && (
                <p className="billing-detail">
                  Te quedan {trialDaysLeft} día{trialDaysLeft === 1 ? '' : 's'} de prueba gratis.
                </p>
              )}
              {billing.subscriptionStatus === 'PAST_DUE' && (
                <p className="billing-detail">No pudimos procesar tu último pago. Actualizá tu tarjeta para no perder el acceso.</p>
              )}
              {billing.subscriptionStatus === 'CANCELLED' && (
                <p className="billing-detail">Tu suscripción está cancelada.</p>
              )}
            </div>
            {['TRIALING', 'ACTIVE'].includes(billing.subscriptionStatus) && (
              <button onClick={handleCancelSubscription} disabled={cancelling} className="cancel-btn">
                {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
              </button>
            )}
          </div>
        )}

        <div className="bento-grid">
          <div className="bento-card">
            <h3>Consultas este mes</h3>
            <div className="stat-value">
              {stats.usage} <span className="stat-limit">/ {stats.limit || '∞'}</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${stats.limit ? Math.min((stats.usage / stats.limit) * 100, 100) : 0}%` }}
              />
            </div>
            <p className="stat-meta">Plan actual: {stats.plan}</p>
          </div>

          <div className="bento-card">
            <h3>Documentos activos</h3>
            <div className="stat-value">{documents.length}</div>
            <p className="stat-meta">Archivos indexados y listos para consultar</p>
          </div>
        </div>

        <section className="documents-section">
          <div className="section-header">
            <h2 className={serif.className}>Tus documentos</h2>
            <Link href="/dashboard/upload" className="btn-solid">Subir documento</Link>
          </div>

          <div className="table-container">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Nombre del archivo</th>
                  <th>Tamaño</th>
                  <th>Chunks</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-state">No hay documentos subidos todavía. Empezá subiendo uno.</td>
                  </tr>
                ) : (
                  documents.map(doc => (
                    <tr key={doc.id}>
                      <td className="doc-name">{doc.originalName}</td>
                      <td className="mono-cell">{(doc.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="mono-cell">{doc.chunkCount ?? '—'}</td>
                      <td>
                        <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                          {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteDocument(doc.id, doc.originalName)}
                          disabled={deletingId === doc.id}
                          className="delete-btn"
                        >
                          {deletingId === doc.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .dash, .dash * {
          box-sizing: border-box;
        }
      `}</style>

      <style jsx>{`
        .dash {
          --db-bg: #FBFBFA;
          --db-surface: #FFFFFF;
          --db-border: #EAEAEA;
          --db-ink: #2F3437;
          --db-muted: #787774;
          --db-red-bg: #FDEBEC; --db-red-text: #9F2F2D;
          --db-blue-bg: #E1F3FE; --db-blue-text: #1F6C9F;
          --db-green-bg: #EDF3EC; --db-green-text: #346538;
          --db-yellow-bg: #FBF3DB; --db-yellow-text: #956400;

          min-height: 100vh;
          background: var(--db-bg);
          color: var(--db-ink);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
        }

        .loading-screen {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: #FBFBFA;
          color: #787774;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .dash-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          padding: 1.25rem 2rem;
          border-bottom: 1px solid var(--db-border);
          background: var(--db-surface);
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .brand-name {
          font-weight: 600;
          font-size: 1.05rem;
          letter-spacing: -0.01em;
        }

        .tenant-badge {
          background: var(--db-bg);
          border: 1px solid var(--db-border);
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.75rem;
          color: var(--db-muted);
        }

        .nav-actions {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
          min-width: 0;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          min-width: 0;
          font-size: 0.85rem;
          color: var(--db-muted);
        }

        .user-email {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 40vw;
        }

        .logout-btn {
          color: var(--db-ink);
          font-weight: 500;
          font-size: 0.85rem;
        }
        .logout-btn:hover {
          color: var(--db-muted);
        }

        :global(.dash .btn-outline) {
          border: 1px solid var(--db-border);
          color: var(--db-ink);
          padding: 0.45rem 0.9rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          transition: border-color 0.15s ease;
        }
        :global(.dash .btn-outline:hover) {
          border-color: var(--db-ink);
        }

        :global(.dash .btn-solid) {
          background: var(--db-ink);
          color: var(--db-surface);
          padding: 0.55rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
        }
        :global(.dash .btn-solid:hover) {
          opacity: 0.85;
        }

        .dash-content {
          padding: 2.5rem 2rem;
          max-width: 1100px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 2rem;
        }

        .page-title {
          font-size: 2.5rem;
          font-weight: 400;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin-bottom: 0.4rem;
        }

        .page-subtitle {
          color: var(--db-muted);
          font-size: 0.95rem;
        }

        .billing-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1.1rem 1.4rem;
          margin-bottom: 2rem;
          border-radius: 8px;
          background: var(--db-blue-bg);
        }

        .billing-status { font-weight: 600; margin-bottom: 0.2rem; color: var(--db-blue-text); }
        .billing-detail { font-size: 0.85rem; color: var(--db-ink); }

        .billing-past_due { background: var(--db-red-bg); }
        .billing-past_due .billing-status { color: var(--db-red-text); }

        .billing-cancelled, .billing-paused { background: var(--db-border); }
        .billing-cancelled .billing-status, .billing-paused .billing-status { color: var(--db-muted); }

        .cancel-btn {
          background: transparent;
          border: 1px solid currentColor;
          color: var(--db-red-text);
          padding: 0.45rem 0.9rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 500;
          white-space: nowrap;
        }
        .cancel-btn:hover { background: rgba(159, 47, 45, 0.08); }
        .cancel-btn:disabled { opacity: 0.5; }

        .bento-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1px;
          background: var(--db-border);
          border: 1px solid var(--db-border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 3rem;
        }

        .bento-card {
          background: var(--db-surface);
          padding: 1.5rem;
        }

        .bento-card h3 {
          font-size: 0.85rem;
          color: var(--db-muted);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .stat-value {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 2.25rem;
          font-weight: 500;
          margin-bottom: 1rem;
          letter-spacing: -0.02em;
        }

        .stat-limit {
          font-size: 1.1rem;
          color: var(--db-muted);
          font-weight: 400;
        }

        .progress-track {
          height: 4px;
          background: var(--db-border);
          border-radius: 2px;
          margin-bottom: 1rem;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--db-ink);
        }

        .stat-meta {
          font-size: 0.8rem;
          color: var(--db-muted);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 1.25rem;
        }

        .section-header h2 {
          font-size: 1.6rem;
          font-weight: 400;
          letter-spacing: -0.01em;
        }

        .table-container {
          border: 1px solid var(--db-border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--db-surface);
        }

        .docs-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .docs-table th {
          padding: 0.85rem 1.25rem;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--db-muted);
          font-weight: 500;
          border-bottom: 1px solid var(--db-border);
        }

        .docs-table td {
          padding: 0.9rem 1.25rem;
          border-bottom: 1px solid var(--db-border);
          color: var(--db-ink);
          font-size: 0.9rem;
        }

        .docs-table tr:last-child td {
          border-bottom: none;
        }

        .mono-cell {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          color: var(--db-muted);
          font-size: 0.85rem;
        }

        .doc-name {
          font-weight: 500;
        }

        .empty-state {
          text-align: center !important;
          padding: 3rem !important;
          color: var(--db-muted) !important;
        }

        .status-badge {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status-indexed { background: var(--db-green-bg); color: var(--db-green-text); }
        .status-pending { background: var(--db-yellow-bg); color: var(--db-yellow-text); }
        .status-processing { background: var(--db-blue-bg); color: var(--db-blue-text); }
        .status-failed { background: var(--db-red-bg); color: var(--db-red-text); }

        .delete-btn {
          color: var(--db-red-text);
          font-size: 0.8rem;
          font-weight: 500;
          white-space: nowrap;
        }
        .delete-btn:hover { text-decoration: underline; }
        .delete-btn:disabled { opacity: 0.5; text-decoration: none; }
      `}</style>
    </div>
  );
}
