import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения!');
    process.exit(1);
}

// ============ СТАТИЧЕСКИЕ СТРАНИЦЫ ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============ WEBHOOK ============
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
    const { message, edited_message } = req.body;
    const msg = message || edited_message;

    if (msg && msg.text) {
        const userId = msg.from.id.toString();
        const chatId = msg.chat.id.toString();
        const text = msg.text;
        const username = msg.from.username || msg.from.first_name;

        console.log(`📝 ${username} (${userId}): ${text}`);

        const clientWs = clients.get(userId);

        if (clientWs && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
                type: 'message',
                from: {
                    id: userId,
                    username: username,
                    name: msg.from.first_name
                },
                chatId: chatId,
                text: text,
                timestamp: Date.now()
            }));
            console.log(`✅ Переслано клиенту ${userId}`);
        } else {
            console.log(`⚠️ Клиент ${userId} не в сети`);
        }
    }

    res.sendStatus(200);
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot_token_configured: !!BOT_TOKEN,
        clients_connected: clients.size,
        timestamp: Date.now()
    });
});

// ============ WEBSOCKET ============
wss.on('connection', (ws, req) => {
    console.log('🔌 Новый клиент подключился');
    let userId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'auth') {
                userId = message.userId;
                clients.set(userId, ws);
                console.log(`✅ Авторизован клиент ${userId}`);

                ws.send(JSON.stringify({
                    type: 'auth_success',
                    userId: userId
                }));
            } else if (message.type === 'send_message') {
                sendToTelegram(message.chatId, message.text);
            }
        } catch (err) {
            console.error('❌ Ошибка:', err.message);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`🔌 Клиент ${userId} отключился`);
        }
    });
});

async function sendToTelegram(chatId, text) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });

        await response.json();
        console.log(`📤 Отправлено в Telegram chat ${chatId}`);
    } catch (err) {
        console.error(`❌ Ошибка отправки: ${err.message}`);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Главная страница: https://msgsendlerpro.bothost.tech/`);
    console.log(`📊 Health check: https://msgsendlerpro.bothost.tech/health`);
    console.log(`🔌 WebSocket: ws://msgsendlerpro.bothost.tech:${PORT}\n`);
});