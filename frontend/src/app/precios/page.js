'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '../../lib/api';

const HIGHLIGHTED_PLAN = 'PYMES';

export default function Precios() {
  const router = useRouter();
  const [plans, setPlans] = useState([]);
  const [trialDays, setTrialDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/billing/plans`)
      .then(res => {
        if (!res.ok) throw new Error('bad response');
        return res.json();
      })
      .then(data => {
        setPlans(data.plans ?? []);
        setTrialDays(data.trialDays ?? 15);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (ars) =>
    ars === 0 ? 'Gratis' : `$${ars.toLocaleString('es-AR')}`;

  return (
    <main className="precios-container animate-fade-in">
      <div className="precios-header">
        <p className="precios-eyebrow">Precios</p>
        <h1 className="precios-title">
          Escalá tu negocio. <span className="gradient-text">Elegí el plan ideal para vos.</span>
        </h1>
      </div>

      {loading ? (
        <p className="precios-loading">Cargando planes...</p>
      ) : error ? (
        <p className="precios-loading">No pudimos cargar los planes. Recargá la página o intentá más tarde.</p>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`plan-card glass-panel ${plan.key === HIGHLIGHTED_PLAN ? 'plan-highlighted' : ''}`}
            >
              {plan.key === HIGHLIGHTED_PLAN && <span className="plan-badge">MÁS ELEGIDO</span>}

              {plan.key === 'GRATIS' && <p className="plan-eyebrow">Probá gratis ahora</p>}
              <h2 className="plan-name">{plan.label}</h2>
              <div className="plan-price">
                {formatPrice(plan.priceArs)}
                <span className="plan-price-suffix">
                  {plan.key === 'GRATIS' ? `/${trialDays} días` : '/mes'}
                </span>
              </div>

              <button
                onClick={() => router.push(`/registro?plan=${plan.key}`)}
                className={plan.key === HIGHLIGHTED_PLAN ? 'btn-primary plan-cta' : 'btn-secondary plan-cta'}
              >
                Empezar ahora
              </button>

              <ul className="plan-features">
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <span className="check">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .precios-container {
          min-height: 100vh;
          padding: 4rem 2rem;
          background: radial-gradient(circle at 50% -20%, rgba(102, 252, 241, 0.1) 0%, rgba(11, 12, 16, 1) 70%);
        }

        .precios-header {
          text-align: center;
          max-width: 700px;
          margin: 0 auto 3rem;
        }

        .precios-eyebrow {
          color: var(--accent-primary);
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .precios-title {
          font-size: clamp(1.75rem, 5vw, 2.75rem);
          font-weight: 700;
          line-height: 1.2;
        }

        .precios-loading {
          text-align: center;
          color: var(--text-secondary);
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          max-width: 1100px;
          margin: 0 auto;
        }

        .plan-card {
          position: relative;
          padding: 2rem;
          display: flex;
          flex-direction: column;
        }

        .plan-highlighted {
          border: 1px solid var(--accent-primary);
          box-shadow: var(--shadow-glow);
        }

        .plan-badge {
          position: absolute;
          top: -0.75rem;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
          color: var(--bg-base);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 0.3rem 0.9rem;
          border-radius: var(--radius-full);
        }

        .plan-eyebrow {
          color: var(--text-muted);
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
        }

        .plan-name {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
        }

        .plan-price {
          font-size: 2.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
        }

        .plan-price-suffix {
          font-size: 1rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .plan-cta {
          width: 100%;
          margin-bottom: 1.5rem;
        }

        .plan-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .plan-features li {
          font-size: 0.9rem;
          color: var(--text-secondary);
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .check {
          color: var(--accent-primary);
          font-weight: 700;
        }
      `}</style>
    </main>
  );
}
