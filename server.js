import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

// Хранилище сообщений: { userId: [messages] }
const messages = new Map();
// Хранилище последних запросов (для long polling)
const waitingRequests = new Map();

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// ============ API ============

// Регистрация/проверка пользователя
app.post('/api/auth', (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    if (!messages.has(userId)) {
        messages.set(userId, []);
    }

    res.json({
        success: true,
        userId: userId,
        message: 'Авторизация успешна'
    });
});

// Отправка сообщения
app.post('/api/send', (req, res) => {
    const { from, to, text } = req.body;

    if (!from || !to || !text) {
        return res.status(400).json({ error: 'from, to, text required' });
    }

    const message = {
        id: Date.now() + Math.random(),
        from: from,
        to: to,
        text: text,
        timestamp: Date.now()
    };

    // Сохраняем для получателя
    if (!messages.has(to)) {
        messages.set(to, []);
    }
    messages.get(to).push(message);

    console.log(`📨 ${from} -> ${to}: ${text.substring(0, 50)}`);

    // Если есть ожидающий long polling запрос от получателя - отвечаем сразу
    const waiting = waitingRequests.get(to);
    if (waiting) {
        waitingRequests.delete(to);
        waiting.json({ messages: [message] });
    }

    res.json({ success: true, messageId: message.id });
});

// Получение сообщений (long polling)
app.get('/api/messages/:userId', async (req, res) => {
    const { userId } = req.params;
    const timeout = parseInt(req.query.timeout) || 30000; // 30 секунд по умолчанию

    if (!messages.has(userId)) {
        messages.set(userId, []);
    }

    const userMessages = messages.get(userId);

    // Если есть сообщения - сразу отдаем
    if (userMessages.length > 0) {
        const msgs = [...userMessages];
        messages.set(userId, []); // Очищаем после отправки
        return res.json({ messages: msgs });
    }

    // Нет сообщений - ждем с таймаутом
    const timeoutId = setTimeout(() => {
        const waiting = waitingRequests.get(userId);
        if (waiting) {
            waitingRequests.delete(userId);
            waiting.json({ messages: [] });
        }
    }, timeout);

    waitingRequests.set(userId, res);

    // Очищаем таймаут при закрытии соединения
    req.on('close', () => {
        clearTimeout(timeoutId);
        waitingRequests.delete(userId);
    });
});

// Получить список онлайн пользователей (кто недавно был активен)
app.get('/api/users', (req, res) => {
    const onlineUsers = Array.from(messages.keys());
    res.json({ users: onlineUsers });
});

// Статус сервера
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        users_count: messages.size,
        waiting_count: waitingRequests.size,
        timestamp: Date.now()
    });
});

// Простая HTML страница
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Мессенджер Сервер</title>
            <style>
                body { font-family: Arial; padding: 20px; background: #f0f0f0; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
                h1 { color: #333; }
                .status { background: #e0e0e0; padding: 10px; border-radius: 5px; }
                code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Мессенджер Сервер (REST API)</h1>
                <div class="status" id="status">Загрузка...</div>
                <h2>API Endpoints:</h2>
                <ul>
                    <li><code>POST /api/auth</code> - Авторизация</li>
                    <li><code>POST /api/send</code> - Отправить сообщение</li>
                    <li><code>GET /api/messages/:userId</code> - Получить сообщения</li>
                    <li><code>GET /api/users</code> - Список пользователей</li>
                    <li><code>GET /health</code> - Статус сервера</li>
                </ul>
            </div>
            <script>
                fetch('/health')
                    .then(r => r.json())
                    .then(d => document.getElementById('status').innerHTML =
                        '<strong>✅ Сервер работает</strong><br>Пользователей: ' + d.users_count)
                    .catch(() => document.getElementById('status').innerHTML = '<strong>❌ Ошибка</strong>');
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 REST сервер запущен на порту ${PORT}`);
    console.log(`📡 API: http://msgsendlerpro.bothost.tech:${PORT}`);
    console.log(`📊 Health: http://msgsendlerpro.bothost.tech:${PORT}/health\n`);
});