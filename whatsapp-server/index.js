const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

let currentPairingCode = null;
let isAuthenticated = false;

// Helpers para rodar dentro do Docker na nuvem
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
    (process.platform === 'linux' ? '/usr/bin/google-chrome-stable' : null);

const puppeteerConfig = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu']
};

if (puppeteerExecutablePath) {
    puppeteerConfig.executablePath = puppeteerExecutablePath;
}

// Inicializa o Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// Substitui o uso exclusivo de QR pelo log do console (QR ainda é emitido, mas não usaremos na UI)
client.on('qr', async (qr) => {
    console.log('QR Code ignorado, aguardando solicitação de Pairing Code via UI.');
});

client.on('ready', () => {
    console.log('Cliente WhatsApp logado e pronto!');
    isAuthenticated = true;
    currentPairingCode = null;
});

client.on('authenticated', () => {
    console.log('Autenticação bem sucedida!');
    isAuthenticated = true;
});

client.on('disconnected', () => {
    console.log('WhatsApp desconectado!');
    isAuthenticated = false;
});

client.initialize();

// -- ROTAS DA API -- //

// Status geral do servidor
app.get('/status', (req, res) => {
    if (isAuthenticated) {
        return res.json({ status: 'AUTHENTICATED' });
    } else if (currentPairingCode) {
        return res.json({ status: 'PAIRING_READY', code: currentPairingCode });
    } else {
        return res.json({ status: 'NEEDS_PAIRING' });
    }
});

// Solicita o código
app.post('/request-pairing', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Número de telefone obrigatório' });

    console.log(`Solicitando código de pareamento para: ${phoneNumber}`);
    try {
        const code = await client.requestPairingCode(phoneNumber.replace(/\D/g, ''));
        currentPairingCode = code;
        res.json({ code: currentPairingCode });
    } catch (e) {
        console.error("Erro no pairing:", e);
        res.status(500).json({ error: e.message });
    }
});

// Lista todos os grupos
app.get('/groups', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup).map(group => ({
            id: group.id._serialized,
            name: group.name
        }));
        res.json({ groups });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Envia a mensagem com ou sem imagem
app.post('/send', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
    
    const { groupId, text, imageUrl } = req.body;
    
    if (!groupId || !text) {
        return res.status(400).json({ error: 'groupId e text são obrigatórios' });
    }

    try {
        if (imageUrl) {
            // Tenta baixar a imagem via URL
            console.log("Baixando imagem para anexo...");
            const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
            await client.sendMessage(groupId, media, { caption: text });
        } else {
            // Apenas texto
            await client.sendMessage(groupId, text);
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Erro ao enviar mensagem:", e);
        res.status(500).json({ error: e.message });
    }
});

// Ping da Nuvem para manter vivo
app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor WhatsApp rodando na porta ${PORT}`);
    console.log(`Iniciando a sessão do WhatsApp, aguarde...`);
});
