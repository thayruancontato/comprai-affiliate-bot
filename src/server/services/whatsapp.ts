import { Client, RemoteAuth, MessageMedia } from 'whatsapp-web.js';
import { UpstashRedisStore } from './upstash-store';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * CONFIGURAÇÃO DE PERSISTÊNCIA NA NUVEM
 * Usamos RemoteAuth + Upstash Redis para que o login não seja perdido no Render.
 */

const store = new UpstashRedisStore();
let watchdogTimer: NodeJS.Timeout | null = null;

export let whatsappClient: Client;

export function initializeWhatsApp() {
  console.log('[WhatsApp] Inicializando cliente...');
  
  whatsappClient = new Client({
    authStrategy: new RemoteAuth({
      clientId: 'compraki-bot',
      store: store as any,
      backupSyncIntervalMs: 600000, // 10 min
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
  });

  setupEventListeners();
  whatsappClient.initialize().catch(err => {
    console.error('[WhatsApp] Erro na inicialização fatal:', err);
  });
}

function setupEventListeners() {
  whatsappClient.on('qr', (qr) => {
    console.log('[WhatsApp] Novo QR Code gerado.');
    (global as any).waStatus = 'AGUARDANDO QR';
    (global as any).waQRCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    // Inicia/Reinicia o watchdog sempre que um novo QR chega
    resetWatchdog();
  });

  whatsappClient.on('ready', () => {
    console.log('[WhatsApp] Cliente conectado e pronto!');
    (global as any).waStatus = 'CONECTADO';
    (global as any).waQRCode = null;
    stopWatchdog();
  });

  whatsappClient.on('authenticated', () => {
    console.log('[WhatsApp] Autenticado com sucesso.');
    (global as any).waStatus = 'AUTENTICADO';
  });

  whatsappClient.on('auth_failure', () => {
    console.error('[WhatsApp] Falha na autenticação.');
    (global as any).waStatus = 'ERRO DE SESSÃO';
    restartWhatsApp(); // Tenta recuperar automaticamente
  });

  whatsappClient.on('disconnected', (reason) => {
    console.log('[WhatsApp] Cliente desconectado:', reason);
    (global as any).waStatus = 'DESCONECTADO';
    restartWhatsApp();
  });

  whatsappClient.on('remote_session_saved', () => {
    console.log('[WhatsApp] Sessão remota salva com sucesso no Redis!');
  });
}

function resetWatchdog() {
  stopWatchdog();
  // Se em 5 minutos não conectar depois de gerar o QR, reinicia o processo
  watchdogTimer = setTimeout(() => {
    if ((global as any).waStatus === 'AGUARDANDO QR') {
      console.warn('[WhatsApp] Watchdog: QR Code expirou ou demorou demais. Reiniciando...');
      restartWhatsApp();
    }
  }, 300000); // 5 min
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export async function restartWhatsApp() {
  console.log('[WhatsApp] Reiniciando serviço...');
  (global as any).waStatus = 'REINICIANDO';
  
  try {
    if (whatsappClient) {
      await whatsappClient.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn('[WhatsApp] Erro ao destruir cliente:', e);
  }

  initializeWhatsApp();
}

export async function sendGroupMessage(groupId: string, text: string, imageUrl?: string) {
  if ((global as any).waStatus !== 'CONECTADO') {
     throw new Error('WhatsApp Bot ainda não está pronto ou conectado');
  }

  try {
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl).catch(() => null);
      if (media) {
        await whatsappClient.sendMessage(groupId, media, { caption: text });
      } else {
        await whatsappClient.sendMessage(groupId, text);
      }
    } else {
      await whatsappClient.sendMessage(groupId, text);
    }
    console.log(`Mensagem enviada com sucesso para ${groupId}`);
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    throw error;
  }
}

// Inicialização inicial
initializeWhatsApp();
