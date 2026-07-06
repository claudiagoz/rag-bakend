'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_URL } from '../../lib/api';
import MercadoPagoCardForm from './components/MercadoPagoCardForm';

const PLAN_PRICES = { GRATIS: 0, EMPRENDEDORES: 150000, PYMES: 300000 };

function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan') || 'EMPRENDEDORES';
  // "Gratis" no es un destino de facturación — si vienen de esa tarjeta,
  // arrancamos preseleccionando el plan pago más económico.
  const billingPlan = initialPlan === 'PYMES' ? 'PYMES' : 'EMPRENDEDORES';

  const [step, setStep] = useState('account'); // 'account' | 'card'
  const [formData, setFormData] = useState({
    companyName: '',
    slug: '',
    adminEmail: '',
    adminPassword: '',
    plan: billingPlan,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = (e) => {
    e.preventDefault();
    setError('');
    if (!formData.companyName || !formData.slug || !formData.adminEmail || !formData.adminPassword) {
      setError('Completá todos los campos.');
      return;
    }
    setStep('card');
  };

  const handleCardToken = async (cardToken, cardholderEmail) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: formData.companyName,
          slug: formData.slug,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          plan: formData.plan,
          cardToken,
          payerEmail: cardholderEmail || formData.adminEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la cuenta');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('tenant', JSON.stringify(data.tenant));

      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
      setStep('account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registro-container animate-fade-in">
      <div className="registro-card glass-panel">
        <h2 className="registro-title">Creá tu cuenta</h2>
        <p className="registro-subtitle">
          15 días de prueba gratis. Te pedimos la tarjeta ahora, pero no te cobramos nada hasta que termine el trial.
        </p>

        {error && <div className="error-box">{error}</div>}

        {step === 'account' ? (
          <form onSubmit={handleContinue} className="registro-form">
            <div className="input-group">
              <label>Nombre de la Empresa</label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={e => setFormData({
                  ...formData,
                  companyName: e.target.value,
                  slug: e.target.value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                })}
              />
            </div>

            <div className="input-group">
              <label>Identificador Único (Slug)</label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              />
            </div>

            <div className="input-group">
              <label>Email del administrador</label>
              <input
                type="email"
                required
                value={formData.adminEmail}
                onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label>Contraseña</label>
              <input
                type="password"
                required
                value={formData.adminPassword}
                onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label>Plan (a partir del día 16)</label>
              <select
                value={formData.plan}
                onChange={e => setFormData({ ...formData, plan: e.target.value })}
                className="custom-select"
              >
                <option value="EMPRENDEDORES">Emprendedores — $150.000/mes</option>
                <option value="PYMES">Pymes — $300.000/mes</option>
              </select>
            </div>

            <button type="submit" className="btn-primary registro-btn">Continuar</button>
          </form>
        ) : (
          <div className="registro-form">
            <p className="card-step-info">
              Plan <strong>{formData.plan === 'PYMES' ? 'Pymes' : 'Emprendedores'}</strong> — se te va a cobrar
              recién el día 16, cuando termine tu prueba gratis.
            </p>
            <MercadoPagoCardForm
              amount={PLAN_PRICES[formData.plan]}
              onToken={handleCardToken}
              submitLabel={loading ? 'Creando cuenta...' : 'Empezar mi prueba gratis'}
            />
            <button type="button" className="btn-secondary back-btn" onClick={() => setStep('account')}>
              Volver
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .registro-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, rgba(69, 162, 158, 0.15) 0%, rgba(11, 12, 16, 1) 100%);
          padding: 2rem;
        }
        .registro-card {
          width: 100%;
          max-width: 460px;
          padding: 2.5rem 2rem;
        }
        .registro-title {
          font-size: 1.75rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        .registro-subtitle {
          color: var(--text-secondary);
          text-align: center;
          margin-bottom: 2rem;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .registro-form {
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
        .input-group input, .custom-select {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          color: white;
        }
        .registro-btn, .back-btn {
          width: 100%;
          margin-top: 0.5rem;
        }
        .card-step-info {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
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

export default function Registro() {
  return (
    <Suspense fallback={<div className="loading-screen">Cargando...</div>}>
      <RegistroForm />
    </Suspense>
  );
}
