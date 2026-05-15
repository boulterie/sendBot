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

// Хранилище подключенных клиентов (userId -> WebSocket)
const clients = new Map();

// Middleware
app.use(express.json());

// === КЛЮЧЕВЫЕ ИСПРАВЛЕНИЯ ===
// 1. Берем порт из переменной окружения, как сказано в документации
const PORT = process.env.PORT || 3000;

// 2. Берем токен из переменных окружения (если нужен для Telegram)
const BOT_TOKEN = process.env.BOT_TOKEN;

console.log('🚀 Запуск сервера мессенджера...');
console.log(`🤖 BOT_TOKEN: ${BOT_TOKEN ? 'настроен' : 'не настроен'}`);
// ===========================

// ============ СТАТИЧЕСКИЕ СТРАНИЦЫ ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============ WEBHOOK ДЛЯ TELEGRAM (опционально) ============
if (BOT_TOKEN) {
    // Путь для вебхука должен совпадать с тем, что мы укажем в Telegram
    app.post(`/webhook`, (req, res) => {
        console.log('📨 Получен webhook от Telegram');
        const { message } = req.body;

        if (message && message.text) {
            const userId = message.from.id.toString();
            const text = message.text;
            const username = message.from.username || message.from.first_name;

            console.log(`📝 Telegram от ${username} (${userId}): ${text}`);

            // Ищем клиента с таким ID
            const clientWs = clients.get(userId);
            if (clientWs && clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({
                    type: 'message',
                    from: {
                        id: userId,
                        username: username,
                        name: message.from.first_name
                    },
                    text: text,
                    timestamp: Date.now()
                }));
                console.log(`✅ Переслано клиенту ${userId}`);
            } else {
                console.log(`⚠️ Клиент ${userId} не в сети`);
            }
        }

        // Всегда отвечаем 200, чтобы Telegram не дублировал запросы
        res.sendStatus(200);
    });
}

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clients_connected: clients.size,
        clients_list: Array.from(clients.keys()),
        bot_token_configured: !!BOT_TOKEN,
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// ============ WEBSOCKET ДЛЯ КЛИЕНТОВ ============
wss.on('connection', (ws, req) => {
    console.log(`🔌 Новое WebSocket подключение от ${req.socket.remoteAddress}`);
    let userId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📡 Получено сообщение от ${userId || 'неизвестно'}:`, message.type);

            switch (message.type) {
                case 'auth':
                    // Аутентификация клиента
                    userId = message.userId;
                    clients.set(userId, ws);
                    console.log(`✅ Авторизован клиент: ${userId}`);
                    console.log(`📊 Всего клиентов онлайн: ${clients.size}`);

                    // Отправляем подтверждение
                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        userId: userId,
                        message: 'Вы успешно подключены к серверу'
                    }));
                    break;

                case 'send_message':
                    // Отправка сообщения другому клиенту
                    const targetId = message.targetId;
                    const text = message.text;
                    const timestamp = message.timestamp || Date.now();

                    console.log(`💬 ${userId} -> ${targetId}: ${text.substring(0, 50)}`);

                    // Ищем получателя
                    const targetWs = clients.get(targetId);

                    if (targetWs && targetWs.readyState === 1) {
                        // Отправляем сообщение получателю
                        targetWs.send(JSON.stringify({
                            type: 'message',
                            from: {
                                id: userId,
                                username: userId
                            },
                            text: text,
                            timestamp: timestamp
                        }));
                        console.log(`✅ Сообщение доставлено ${targetId}`);

                        // Отправляем отправителю подтверждение
                        ws.send(JSON.stringify({
                            type: 'message_delivered',
                            targetId: targetId,
                            timestamp: timestamp
                        }));
                    } else {
                        console.log(`❌ Клиент ${targetId} не в сети`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            error: `Клиент ${targetId} не в сети`,
                            targetId: targetId
                        }));
                    }
                    break;

                case 'ping':
                    // Проверка соединения
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                    break;

                case 'get_online_users':
                    // Получить список онлайн пользователей
                    const onlineUsers = Array.from(clients.keys());
                    ws.send(JSON.stringify({
                        type: 'online_users',
                        users: onlineUsers,
                        count: onlineUsers.length
                    }));
                    break;

                default:
                    console.log(`⚠️ Неизвестный тип сообщения: ${message.type}`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: `Неизвестный тип: ${message.type}`
                    }));
            }
        } catch (err) {
            console.error(`❌ Ошибка обработки сообщения: ${err.message}`);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Ошибка обработки сообщения'
            }));
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`🔌 Клиент ${userId} отключился`);
            console.log(`📊 Осталось клиентов: ${clients.size}`);
        }
    });

    ws.on('error', (err) => {
        console.error(`❌ WebSocket ошибка: ${err.message}`);
        if (userId) {
            clients.delete(userId);
        }
    });
});

// === КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: СЛУШАЕМ НА 0.0.0.0 ===
// 3. Обязательно используем host '0.0.0.0' для работы reverse proxy
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Сервер мессенджера запущен!`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📡 Порт: ${PORT} (слушаем на 0.0.0.0)`);
    console.log(`🔌 WebSocket: wss://msgsendlerpro.bothost.tech/`);
    console.log(`📊 Health check: https://msgsendlerpro.bothost.tech/health`);
    console.log(`🌐 Главная страница: https://msgsendlerpro.bothost.tech`);

    if (BOT_TOKEN) {
        console.log(`🤖 Telegram webhook: https://msgsendlerpro.bothost.tech/webhook`);
    }
    console.log(`${'='.repeat(50)}\n`);
});

// Обработка graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, закрываем соединения...');
    for (const [userId, ws] of clients) {
        ws.close(1000, 'Сервер останавливается');
    }
    wss.close(() => {
        server.close(() => {
            console.log('✅ Сервер остановлен');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Получен SIGINT, закрываем соединения...');
    process.exit(0);
});