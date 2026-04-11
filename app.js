const express = require('express');
const { Telegraf } = require('telegraf');
require('dotenv').config();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 6712;  // Будет 6712 из .env

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Web App URL (после деплоя замените на свой домен)
const WEB_APP_URL = 'https://ваш-поддомен.bothost.ru';

// ========== TELEGRAM БОТ ==========
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    try {
        await ctx.reply(
            '🤖 <b>Добро пожаловать в Messenger Bot!</b>\n\n' +
            'Нажмите кнопку ниже, чтобы открыть приложение.\n\n' +
            `📌 <i>Ваш ID: ${ctx.chat.id}</i>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 Открыть мессенджер', web_app: { url: WEB_APP_URL } }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Ошибка:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

bot.help(async (ctx) => {
    await ctx.reply('📖 Справка: /start - запустить бота');
});

bot.launch().then(() => {
    console.log('🤖 Telegram бот запущен');
});

// ========== API ДЛЯ КЛИЕНТА ==========
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), port: PORT });
});

app.get('/api/info', (req, res) => {
    res.json({ status: 'running', port: PORT });
});

app.post('/api/create_chat', (req, res) => {
    const { username } = req.body;
    console.log('📨 Создание чата:', username);
    const chatId = Math.random().toString(36).substring(2, 10);
    const accessKey = Math.random().toString(36).substring(2, 18);
    res.json({ success: true, chat_id: chatId, access_key: accessKey });
});

app.post('/api/connect_chat', (req, res) => {
    const { chat_id, username } = req.body;
    console.log('🔗 Подключение:', chat_id, username);
    res.json({ success: true, messages: [] });
});

app.post('/api/send_message', (req, res) => {
    const { chat_id, username, text } = req.body;
    console.log(`💬 [${chat_id}] ${username}: ${text}`);
    res.json({ success: true });
});

app.post('/api/send_image', (req, res) => {
    const { chat_id, username } = req.body;
    console.log(`📷 [${chat_id}] Изображение от ${username}`);
    res.json({ success: true });
});

app.post('/api/get_messages', (req, res) => {
    const { chat_id, last_timestamp } = req.body;
    res.json({ success: true, messages: [], last_timestamp: Date.now() });
});

// Корневой маршрут - отдаём index.html из public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера на 0.0.0.0:6712
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`✅ Слушаем на 0.0.0.0:${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
    console.log('='.repeat(50));
});

// Обработка завершения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));