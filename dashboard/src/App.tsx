import { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import './App.css';

interface Status {
  status: string;
  qr: string | null;
  pairingCode: string | null;
}

interface Group {
  name: string;
  id: string;
}

interface Product {
  id: string;
  title: string;
  price: number;
  original_price: number;
  permalink: string;
  thumbnail: string;
  free_shipping: boolean;
}

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? '' 
  : (window.location.origin.includes('pages.dev') ? 'https://compraki-bot.onrender.com' : '');

const SOCKET_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? '/'
  : (window.location.origin.includes('pages.dev') ? 'https://compraki-bot.onrender.com' : '/');


const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: true
});

const CATEGORIES = ['Tudo', 'Eletrônicos', 'Gamer', 'Celulares', 'Cozinha', 'Casa', 'Ferramentas'];

function App() {
  const [activeTab, setActiveTab] = useState('vitrine');
  const [waStatus, setWaStatus] = useState<Status>({ status: 'INICIALIZANDO', qr: null, pairingCode: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [discoveredProducts, setDiscoveredProducts] = useState<Product[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tudo');

  useEffect(() => {
    socket.on('wa_status', (data: Status) => {
      setWaStatus(data);
    });

    const fetchInitialData = async () => {
      try {
        const queueRes = await fetch(`${API_BASE}/api/queue`);
        const queueData = await queueRes.json();
        setQueue(queueData.queue || []);

        const statusRes = await fetch(`${API_BASE}/api/status`);
        const statusData = await statusRes.json();
        if (statusData.status === 'CONECTADO') {
          fetchGroups();
        }
      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
      }
    };

    fetchInitialData();
    handleDiscover('Tudo');

    const heartbeat = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        setWaStatus(data);
      } catch (err) {}
    }, 15000);

    return () => {
      socket.off('wa_status');
      clearInterval(heartbeat);
    };
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/groups`);
      const data = await res.json();
      setGroups(data.groups || []);
      if (data.groups?.length > 0) setSelectedGroup(data.groups[0].id);
    } catch (err) {}
  };

  const handleDiscover = async (category: string) => {
    setLoading(true);
    setSelectedCategory(category);
    try {
      const url = category === 'Tudo' ? `${API_BASE}/api/discover` : `${API_BASE}/api/discover?category=${category}`;
      const res = await fetch(url);
      const data = await res.json();
      setDiscoveredProducts(data.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostDirect = async (product: Product) => {
    if (!selectedGroup) return alert('Selecione um grupo primeiro');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/post-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, groupId: selectedGroup })
      });
      const data = await res.json();
      if (data.success) alert('Enviado com sucesso! 🚀');
    } catch (err) {
      alert('Erro na conexão');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Link copiado! 🔗');
  };

  const filteredProducts = useMemo(() => {
    return discoveredProducts.filter(p => 
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [discoveredProducts, searchQuery]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="logo-section">
          <span className="logo-icon">🛒</span>
          <span className="logo-text">Compraki</span>
        </div>

        <nav className="nav-links">
          <li className={`nav-item ${activeTab === 'vitrine' ? 'active' : ''}`} onClick={() => setActiveTab('vitrine')}>
            <span className="nav-icon">🛍️</span>
            <span className="nav-text">Vitrine</span>
          </li>
          <li className={`nav-item ${activeTab === 'conexao' ? 'active' : ''}`} onClick={() => setActiveTab('conexao')}>
            <span className="nav-icon">📱</span>
            <span className="nav-text">Conexão</span>
          </li>
          <li className={`nav-item ${activeTab === 'fila' ? 'active' : ''}`} onClick={() => setActiveTab('fila')}>
            <span className="nav-icon">⏳</span>
            <span className="nav-text">Fila Bot</span>
          </li>
        </nav>

        <div style={{ marginTop: 'auto' }} className="status-badge-container">
          <div className={`status-badge ${waStatus.status === 'CONECTADO' ? 'online' : 'offline'}`}>
            <span className="dot"></span> {waStatus.status}
          </div>
        </div>
      </aside>

      <main className="main-content">
        {activeTab === 'vitrine' && (
          <div className="marketplace-container fade-in">
            <header className="page-header">
              <h2 className="gradient-text">Vitrine de Ofertas</h2>
              <div className="search-bar">
                <span>🔍</span>
                <input 
                  type="text" 
                  placeholder="Buscar na vitrine..." 
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </header>

            <div className="category-chips">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat} 
                  className={`chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => handleDiscover(cat)}
                  disabled={loading}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="discovery-header">
               <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                 <span>Postar em:</span>
                 <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="glass-select"
                 >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
               </div>
               <button className="btn btn-copy" onClick={() => handleDiscover(selectedCategory)} disabled={loading}>
                 {loading ? 'Sincronizando...' : '🔄 Recarregar'}
               </button>
            </div>

            <div className="product-grid">
              {filteredProducts.map(p => (
                <div key={p.id} className="product-card">
                  <div className="p-img-container">
                    {p.original_price > p.price && (
                      <div className="p-discount-badge">
                        -{Math.round((1 - (p.price / p.original_price)) * 100)}%
                      </div>
                    )}
                    <img src={p.thumbnail} alt={p.title} className="p-img" />
                  </div>
                  <div className="p-content">
                    <h3 className="p-title" title={p.title}>{p.title}</h3>
                    <div className="p-price-box">
                      {p.original_price > p.price && <span className="p-old-price">R$ {p.original_price.toFixed(2)}</span>}
                      <span className="p-new-price">R$ {p.price.toFixed(2)}</span>
                    </div>

                    <div className="action-buttons">
                      <button className="btn btn-copy" onClick={() => copyToClipboard(p.permalink)}>
                        🔗 Copiar
                      </button>
                      <button 
                        className="btn btn-share" 
                        onClick={() => handlePostDirect(p)}
                        disabled={loading || waStatus.status !== 'CONECTADO'}
                      >
                        🚀 Enviar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'conexao' && (
          <div className="glass-card fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2>Conexão WhatsApp</h2>
            <div className="wa-status-container" style={{ marginTop: '20px' }}>
               {waStatus.status === 'CONECTADO' ? (
                <div className="success-ui fade-in">
                  <div className="check-icon">✓</div>
                  <p>Bot Cloud Conectado</p>
                </div>
              ) : waStatus.pairingCode ? (
                <div className="pairing-code-ui fade-in">
                  <p className="pairing-label">Digite este código no WhatsApp:</p>
                  <div className="pairing-code">{waStatus.pairingCode}</div>
                  <p>📱 Menu → Aparelhos Conectados → Conectar com número</p>
                </div>
              ) : waStatus.qr ? (
                <div className="qr-container fade-in" style={{ textAlign: 'center' }}>
                  <img src={waStatus.qr} alt="QR Code" style={{ borderRadius: '15px', maxWidth: '300px' }} />
                </div>
              ) : (
                <div className="loading-ui fade-in">Sincronizando...</div>
              )}

              <hr style={{ margin: '2rem 0', opacity: 0.1 }} />
              
              <div className="pairing-form">
                  <input
                    type="tel"
                    placeholder="5511999998888"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="glass-input"
                    style={{ width: '100%', padding: '15px', borderRadius: '12px', marginBottom: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  />
                  <button className="btn btn-share" style={{ width: '100%' }} onClick={async () => {
                    await fetch(`${API_BASE}/api/whatsapp/pair`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ phoneNumber })
                    });
                  }}>
                    🔗 Gerar Código de Pareamento
                  </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fila' && (
          <div className="glass-card fade-in">
            <h2>Fila de Automação ({queue.length})</h2>
            <div className="scroll-area" style={{ marginTop: '20px' }}>
              {queue.map((item, idx) => (
                <div key={idx} className="queue-item">
                   <span>📦 {typeof item === 'string' ? JSON.parse(item).query : item.query}</span>
                   <button className="btn btn-copy" style={{ color: '#ef4444' }}>🗑️</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
