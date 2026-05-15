import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Хранилище сообщений: { userId: [messages] }
const messages = new Map();
let messageId = 0;

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.options('*', (req, res) => res.sendStatus(200));

// Регистрация пользователя
app.post('/api/auth', (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    if (!messages.has(userId)) {
        messages.set(userId, []);
    }

    console.log(`✅ Авторизован: ${userId}`);
    res.json({ success: true, userId });
});

// Отправка сообщения
app.post('/api/send', (req, res) => {
    const { from, to, text } = req.body;

    if (!from || !to || !text) {
        return res.status(400).json({ error: 'from, to, text required' });
    }

    const msg = {
        id: ++messageId,
        from: from,
        to: to,
        text: text,
        timestamp: Date.now() / 1000
    };

    if (!messages.has(to)) {
        messages.set(to, []);
    }
    messages.get(to).push(msg);

    console.log(`📨 ${from} -> ${to}: ${text.substring(0, 50)}`);
    res.json({ success: true, id: msg.id });
});

// Получение сообщений
app.get('/api/messages/:userId', (req, res) => {
    const { userId } = req.params;

    if (!messages.has(userId)) {
        messages.set(userId, []);
    }

    const userMessages = messages.get(userId);
    messages.set(userId, []);

    res.json({ messages: userMessages });
});

// Статус сервера
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        users: Array.from(messages.keys()),
        timestamp: Date.now()
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Мессенджер Сервер</title></head>
        <body>
            <h1>📡 Мессенджер Сервер</h1>
            <p>Сервер работает!</p>
            <p><a href="/health">Health check</a></p>
        </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 HTTP сервер запущен на порту ${PORT}`);
    console.log(`📡 API: https://msgsendlerpro.bothost.tech`);
    console.log(`📊 Health: https://msgsendlerpro.bothost.tech/health\n`);
});