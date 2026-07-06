'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

// ------------------------------------------------------------
// Tokeniza la tarjeta 100% en el cliente con el SDK de Mercado
// Pago (mp.cardForm) — el backend nunca ve el número de tarjeta,
// solo recibe el card_token_id resultante.
//
// Nota: los inputs de número/vencimiento/código de seguridad son
// iframes seguros que MP inyecta en los divs de abajo — no son
// inputs de React, no llevan value/onChange.
// ------------------------------------------------------------
export default function MercadoPagoCardForm({ amount, onToken, submitLabel = 'Confirmar tarjeta' }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | mounting | ready | submitting | error
  const [errorMsg, setErrorMsg] = useState('');
  const cardFormRef = useRef(null);

  useEffect(() => {
    if (!sdkReady) return;

    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) {
      setStatus('error');
      setErrorMsg('Falta configurar la clave pública de Mercado Pago (NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY).');
      return;
    }

    const mp = new window.MercadoPago(publicKey, { locale: 'es-AR' });

    cardFormRef.current = mp.cardForm({
      amount: String(amount),
      iframe: true,
      form: {
        id: 'mp-card-form',
        cardNumber: { id: 'mp-cardNumber', placeholder: 'Número de tarjeta' },
        expirationDate: { id: 'mp-expirationDate', placeholder: 'MM/AA' },
        securityCode: { id: 'mp-securityCode', placeholder: 'CVV' },
        cardholderName: { id: 'mp-cardholderName', placeholder: 'Nombre como figura en la tarjeta' },
        cardholderEmail: { id: 'mp-cardholderEmail', placeholder: 'Email' },
        issuer: { id: 'mp-issuer', placeholder: 'Banco emisor' },
        installments: { id: 'mp-installments', placeholder: 'Cuotas' },
        identificationType: { id: 'mp-identificationType', placeholder: 'Tipo de documento' },
        identificationNumber: { id: 'mp-identificationNumber', placeholder: 'Número de documento' },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) {
            console.error('[mercadopago] Error montando el formulario:', error);
            setStatus('error');
            setErrorMsg('No pudimos cargar el formulario de tarjeta. Recargá la página.');
            return;
          }
          setStatus('ready');
        },
        onSubmit: (event) => {
          event.preventDefault();
          setStatus('submitting');

          const data = cardFormRef.current.getCardFormData();
          if (!data?.token) {
            setStatus('error');
            setErrorMsg('No pudimos validar la tarjeta. Revisá los datos e intentá de nuevo.');
            return;
          }

          onToken(data.token, data.cardholderEmail);
        },
      },
    });
  }, [sdkReady, amount, onToken]);

  return (
    <div className="mp-card-form-wrapper">
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        onLoad={() => setSdkReady(true)}
        strategy="afterInteractive"
      />

      {status === 'error' && <div className="mp-error">{errorMsg}</div>}

      <form id="mp-card-form">
        <div className="mp-row">
          <div id="mp-cardNumber" className="mp-field" />
          <div id="mp-expirationDate" className="mp-field mp-field-sm" />
          <div id="mp-securityCode" className="mp-field mp-field-sm" />
        </div>

        <input id="mp-cardholderName" type="text" className="mp-input" />
        <input id="mp-cardholderEmail" type="email" className="mp-input" />

        <div className="mp-row">
          <select id="mp-identificationType" className="mp-input" />
          <input id="mp-identificationNumber" type="text" className="mp-input" placeholder="Número de documento" />
        </div>

        <select id="mp-issuer" className="mp-input" style={{ display: 'none' }} />
        <select id="mp-installments" className="mp-input" style={{ display: 'none' }} />

        <button type="submit" className="btn-primary mp-submit" disabled={status !== 'ready' && status !== 'submitting'}>
          {status === 'submitting' ? 'Procesando...' : submitLabel}
        </button>
      </form>

      <style jsx>{`
        .mp-card-form-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .mp-error {
          background: rgba(255, 76, 76, 0.1);
          color: var(--danger);
          padding: 0.75rem;
          border-radius: var(--radius-md);
          border: 1px solid rgba(255, 76, 76, 0.2);
          font-size: 0.85rem;
        }
        .mp-row {
          display: flex;
          gap: 0.75rem;
        }
        .mp-field, .mp-input {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-md);
          padding: 0.75rem 1rem;
          color: white;
          height: 44px;
          flex: 1;
          width: 100%;
        }
        .mp-field-sm {
          flex: 0.6;
        }
        .mp-submit {
          width: 100%;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
}
