'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './globals.css';

export default function Home() {
  const router = useRouter();

  return (
    <main className="hero-container animate-fade-in">
      <div className="hero-content">
        <h1 className="hero-title">
          Conocimiento impulsado por <span className="gradient-text">IA</span>
        </h1>
        <p className="hero-subtitle">
          El hub de conocimiento inteligente para tu empresa. Chateá con tus documentos internos al instante.
        </p>
        <div className="hero-actions">
          <button onClick={() => router.push('/precios')} className="btn-primary">
            Ver precios
          </button>
          <button onClick={() => router.push('/login')} className="btn-secondary">
            Iniciar Sesión
          </button>
        </div>
      </div>

      <style jsx>{`
        .hero-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: radial-gradient(circle at 50% -20%, rgba(102, 252, 241, 0.15) 0%, rgba(11, 12, 16, 1) 70%);
          padding: 2rem;
        }
        .hero-content {
          text-align: center;
          max-width: 800px;
        }
        .hero-title {
          font-size: clamp(2.5rem, 8vw, 5rem);
          font-weight: 700;
          line-height: 1.1;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }
        .hero-subtitle {
          font-size: clamp(1rem, 3vw, 1.25rem);
          color: var(--text-secondary);
          margin-bottom: 2.5rem;
          line-height: 1.6;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
      `}</style>
    </main>
  );
}
