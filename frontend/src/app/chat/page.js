'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '../../lib/api';

export default function Chat() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenant, setTenant] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedTenant = localStorage.getItem('tenant');
    
    if (!token || !savedTenant) {
      router.push('/login');
      return;
    }
    setTenant(JSON.parse(savedTenant));
    
    // Welcome message
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: JSON.parse(savedTenant).botConfig?.welcomeMessage || 'Hola. ¿En qué te puedo ayudar hoy?'
    }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al obtener respuesta');
      }

      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-layout">
      <nav className="chat-nav glass-panel">
        <Link href="/dashboard" className="back-link">← Volver al Dashboard</Link>
        <span className="tenant-badge">{tenant?.name} - Modo de Prueba</span>
      </nav>

      <main className="chat-container">
        <div className="chat-window glass-panel">
          <div className="messages-area">
            {messages.map((msg, i) => (
              <div key={msg.id} className={`message-bubble ${msg.role}`}>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="message-bubble assistant loading-indicator">
                <span></span><span></span><span></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="input-area">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe una pregunta sobre tus documentos..."
              disabled={loading}
              className="chat-input"
            />
            <button type="submit" disabled={!input.trim() || loading} className="btn-primary send-btn">
              Enviar
            </button>
          </form>
        </div>
      </main>

      <style jsx>{`
        .chat-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .chat-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .tenant-badge {
          background: rgba(102, 252, 241, 0.1);
          color: var(--accent-primary);
          padding: 0.35rem 1rem;
          border-radius: var(--radius-full);
          font-size: 0.85rem;
          font-weight: 600;
        }

        .chat-container {
          flex: 1;
          display: flex;
          justify-content: center;
          padding: 1rem 2rem 2rem;
        }

        .chat-window {
          width: 100%;
          max-width: 800px;
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .message-bubble {
          max-width: 80%;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-md);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .message-bubble.user {
          align-self: flex-end;
          background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
          color: var(--bg-base);
          border-bottom-right-radius: 4px;
        }

        .message-bubble.assistant {
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-bottom-left-radius: 4px;
        }

        .input-area {
          display: flex;
          gap: 1rem;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .chat-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1rem 1.25rem;
          border-radius: var(--radius-full);
          color: white;
          font-size: 0.95rem;
        }
        .chat-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(102, 252, 241, 0.1);
        }

        .send-btn {
          border-radius: var(--radius-full);
        }

        .loading-indicator {
          display: flex;
          gap: 0.4rem;
          padding: 1rem 1.5rem;
        }
        
        .loading-indicator span {
          width: 8px;
          height: 8px;
          background-color: var(--text-secondary);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        
        .loading-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .loading-indicator span:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
