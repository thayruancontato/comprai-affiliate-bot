import { useState, useEffect } from 'react';
import './App.css';

interface Status {
  status: string;
  qr: string | null;
}

interface Group {
  name: string;
  id: string;
}

function App() {
  const [waStatus, setWaStatus] = useState<Status>({ status: 'DESCONECTADO', qr: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statusRes = await fetch('/api/status');
        const statusData = await statusRes.json();
        setWaStatus(statusData);

        if (statusData.status === 'CONECTADO') {
          const groupsRes = await fetch('/api/groups');
          const groupsData = await groupsRes.json();
          setGroups(groupsData.groups);
        }

        const queueRes = await fetch('/api/queue');
        const queueData = await queueRes.json();
        setQueue(queueData.queue);
      } catch (err) {
        console.error('Erro ao buscar dados:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddToQueue = async () => {
    if (!query || !selectedGroup) return alert('Preencha a busca e selecione um grupo');
    setLoading(true);
    try {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      setQuery('');
      alert('Adicionado à fila!');
    } catch (err) {
      alert('Erro ao adicionar à fila');
    } finally {
      setLoading(false);
    }
  };

  const handleTestNow = async () => {
    if (!selectedGroup) return alert('Selecione um grupo para o teste');
    setLoading(true);
    try {
      const res = await fetch('/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      const data = await res.json();
      if (data.success) {
        alert('Postagem imediata enviada com sucesso!');
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (err) {
      alert('Erro ao realizar postagem imediata');
    } finally {
      setLoading(false);
    }
  }

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await fetch(`/api/queue/${index}`, { method: 'DELETE' });
    } catch (err) {
      alert('Erro ao remover da fila');
    }
  };

  const handleRestartBot = async () => {
    if (!confirm('Deseja realmente reiniciar o bot? Isso derrubará a conexão atual.')) return;
    setRestarting(true);
    try {
      await fetch('/api/whatsapp/restart', { method: 'POST' });
      alert('Reinício solicitado. Aguarde o novo QR Code aparecer.');
    } catch (err) {
      alert('Erro ao solicitar reinício');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="container">
      <header className="glass-header">
        <div className="logo-section">
          <div className="logo-icon">🛒</div>
          <h1>Compraki Affiliate Bot</h1>
        </div>
        <div className={`status-badge ${waStatus.status === 'CONECTADO' ? 'online' : 'offline'}`}>
          {waStatus.status}
        </div>
      </header>

      <main className="dashboard-grid">
        {/* Lado Esquerdo: WhatsApp Status */}
        <section className="glass-card whatsapp-section">
          <h2>Conexão WhatsApp</h2>
          <div className="wa-status-container">
            {waStatus.qr ? (
              <div className="qr-container">
                <p>Escaneie o QR Code abaixo:</p>
                <img src={waStatus.qr} alt="WhatsApp QR Code" className="qr-image" />
              </div>
            ) : (
              <div className="connected-msg">
                {waStatus.status === 'CONECTADO' ? (
                  <div className="success-icon">✅ Sucesso! O bot está ativo.</div>
                ) : (
                  <p className="loading-text">Inicializando bot na nuvem...</p>
                )}
              </div>
            )}
            
            <button 
              className="btn btn-secondary restart-btn" 
              onClick={handleRestartBot}
              disabled={restarting}
            >
              {restarting ? 'Reiniciando...' : '🔄 Reiniciar Bot'}
            </button>
          </div>
        </section>

        {/* Lado Direito: Controle de Fila */}
        <section className="glass-card queue-section">
          <h2>Agendar Nova Postagem</h2>
          <div className="form-group">
            <input 
              type="text" 
              placeholder="Ex: iPhone 15 ou Promoção Fralda" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="glass-input"
            />
            <select 
              value={selectedGroup} 
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="glass-select"
            >
              <option value="">Selecione o Grupo</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          
          <div className="action-buttons">
            <button 
              className="btn btn-primary" 
              onClick={handleAddToQueue}
              disabled={loading || waStatus.status !== 'CONECTADO'}
            >
              {loading ? 'Adicionando...' : '➕ Agendar na Fila'}
            </button>

            <button 
              className="btn btn-test" 
              onClick={handleTestNow}
              disabled={loading || waStatus.status !== 'CONECTADO'}
            >
              🚀 Testar Agora (Imediato)
            </button>
          </div>

          <div className="queue-list">
            <h3>Fila Atual ({queue.length})</h3>
            <ul>
              {queue.map((item, idx) => {
                const parsed = JSON.parse(item);
                return (
                  <li key={idx} className="queue-item">
                    <span>🔍 {parsed.query}</span>
                    <button onClick={() => handleRemoveFromQueue(idx)} className="btn-delete">🗑️</button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
