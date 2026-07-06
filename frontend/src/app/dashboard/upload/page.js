'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '../../../lib/api';

export default function UploadDocument() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Por favor selecciona un archivo primero.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/api/documents/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al subir el documento');
      }

      setSuccess('Documento subido con éxito. Ya se está procesando.');
      setFile(null);
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-container animate-fade-in">
      <nav className="top-nav glass-panel">
        <div className="nav-brand">
          <Link href="/dashboard" className="back-link">← Volver al Dashboard</Link>
        </div>
      </nav>

      <main className="upload-content">
        <div className="upload-card glass-panel">
          <h1 className="page-title">Subir Nuevo Documento</h1>
          <p className="page-subtitle">Los documentos que subas serán procesados por la IA para que puedas consultarlos en el chat.</p>

          {error && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}

          <form onSubmit={handleUpload} className="upload-form">
            <div className="file-drop-area">
              <input 
                type="file" 
                onChange={handleFileChange} 
                accept=".pdf,.txt,.docx,.csv" 
                className="file-input"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="file-label">
                <span className="file-icon">📄</span>
                <span className="file-text">
                  {file ? file.name : 'Haz click para seleccionar un archivo (PDF, TXT, DOCX)'}
                </span>
                {file && <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>}
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={!file || loading} style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}>
              {loading ? 'Subiendo e indexando...' : 'Subir Documento'}
            </button>
          </form>
        </div>
      </main>

      <style jsx>{`
        .upload-container {
          min-height: 100vh;
        }

        .top-nav {
          padding: 1rem 2rem;
          margin: 1rem 2rem;
          border-radius: var(--radius-md);
        }

        .back-link {
          color: var(--accent-primary);
          font-weight: 600;
          font-size: 0.95rem;
        }
        .back-link:hover {
          text-decoration: underline;
        }

        .upload-content {
          display: flex;
          justify-content: center;
          padding: 4rem 2rem;
        }

        .upload-card {
          width: 100%;
          max-width: 600px;
          padding: 3rem;
        }

        .page-title {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }

        .page-subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        .file-drop-area {
          position: relative;
          border: 2px dashed rgba(102, 252, 241, 0.3);
          border-radius: var(--radius-lg);
          background: rgba(0, 0, 0, 0.2);
          transition: all var(--transition-fast);
        }
        .file-drop-area:hover {
          border-color: var(--accent-primary);
          background: rgba(102, 252, 241, 0.05);
        }

        .file-input {
          position: absolute;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }

        .file-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          gap: 1rem;
          pointer-events: none;
        }

        .file-icon {
          font-size: 3rem;
          opacity: 0.8;
        }

        .file-text {
          font-weight: 500;
          color: var(--text-primary);
          text-align: center;
        }

        .file-size {
          color: var(--text-muted);
          font-size: 0.85rem;
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
