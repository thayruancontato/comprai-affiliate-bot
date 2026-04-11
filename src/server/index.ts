import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import cron from 'node-cron';
import { whatsappClient, sendGroupMessage, restartWhatsApp } from './services/whatsapp';
import { searchProducts } from './services/mercadolivre';
import { buildWhatsAppPost } from './services/post-builder';
import { redis } from './services/redis';

import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard/dist')));

const PORT = process.env.PORT || 3000;

// API STATUS
app.get('/api/status', (req, res) => {
  const statusInfo = {
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null
  };
  res.json(statusInfo);
});

// NOVO: API RESTART WHATSAPP
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    console.log('[API] Solicitado reinício manual do WhatsApp...');
    await restartWhatsApp();
    res.json({ success: true, message: 'Bot reiniciado com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API GRUPOS
app.get('/api/groups', async (req, res) => {
  try {
    const chats = await whatsappClient.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({ name: g.name, id: g.id._serialized }));
    res.json({ groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API FILA (GET)
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await redis.lrange('ML_OFERTAS_QUEUE', 0, -1);
    res.json({ queue });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API FILA (ADD)
app.post('/api/queue', async (req, res) => {
  const { query, groupId } = req.body;
  if (!query || !groupId) return res.status(400).json({ error: 'Faltando query ou groupId' });

  try {
    await redis.rpush('ML_OFERTAS_QUEUE', JSON.stringify({ query, groupId }));
    res.json({ success: true, message: 'Adicionado à fila de postagem' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API FILA (DELETE)
app.delete('/api/queue/:index', async (req, res) => {
  const index = parseInt(req.params.index);
  try {
    const list = await redis.lrange('ML_OFERTAS_QUEUE', 0, -1);
    list.splice(index, 1);
    await redis.del('ML_OFERTAS_QUEUE');
    if (list.length > 0) {
      await redis.rpush('ML_OFERTAS_QUEUE', ...list);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint manual de teste
app.post('/test-post', async (req, res) => {
  const { query, groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId faltando' });

  try {
    const searchParam = query || 'celular promoção';
    const items = await searchProducts(searchParam, 1);
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Nenhum produto encontrado pelo Scraper' });
    }

    const postData = items[0];
    const text = buildWhatsAppPost(postData, 'A');
    
    await sendGroupMessage(groupId, text, postData.thumbnail);
    res.json({ success: true, message: 'Enviado via Scrapper', product: items[0].title });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CRON JOB
cron.schedule('*/30 * * * *', async () => {
  console.log('[CRON] Verificando fila de postagens...');
  try {
    const item = await redis.lpop<string>('ML_OFERTAS_QUEUE');
    if (!item) return;

    const { query, groupId } = JSON.parse(item);
    console.log(`[CRON] Processando busca: ${query}`);

    const items = await searchProducts(query, 1);
    if (items.length > 0) {
      const text = buildWhatsAppPost(items[0], 'A');
      await sendGroupMessage(groupId, text, items[0].thumbnail);
      console.log(`[CRON] Sucesso ao postar ${query}`);
    }
  } catch (error) {
    console.error('[CRON ERROR]', error);
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../dashboard/dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`- Aguarde o QR Code do WhatsApp inicializar...`);
});
