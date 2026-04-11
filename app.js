const express = require('express');
const { Telegraf } = require('telegraf');
require('dotenv').config();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 6712;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));  // Раздача статики из папки public

// URL вашего веб-приложения (после деплоя замените)
const WEB_APP_URL = 'https://ваш-поддомен.bothost.ru';

// ========== TELEGRAM БОТ ==========
const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start
bot.start(async (ctx) => {
    try {
        await ctx.reply(
            '🤖 <b>Добро пожаловать в Messenger Bot!</b>\n\n' +
            'Этот бот работает как сервер для мессенджера.\n' +
            'Нажмите кнопку ниже, чтобы открыть приложение.\n\n' +
            '📌 <i>Ваш ID в системе: ' + ctx.chat.id + '</i>',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📱 Открыть мессенджер',
                                web_app: { url: WEB_APP_URL }
                            }
                        ],
                        [
                            {
                                text: '❓ Помощь',
                                callback_data: 'help'
                            }
                        ]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Ошибка:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

// Команда /help
bot.help(async (ctx) => {
    await ctx.reply(
        '📖 <b>Справка</b>\n\n' +
        '/start - запустить бота\n' +
        '/help - эта справка\n\n' +
        'Нажмите кнопку "Открыть мессенджер", чтобы начать общение.',
        { parse_mode: 'HTML' }
    );
});

// Обработка callback_data
bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '📖 <b>Как пользоваться:</b>\n\n' +
        '1. Создайте чат в приложении\n' +
        '2. Поделитесь ID чата с собеседником\n' +
        '3. Начните общение!',
        { parse_mode: 'HTML' }
    );
});

// Запуск бота
bot.launch().then(() => {
    console.log('🤖 Telegram бот запущен');
});

// Остановка бота при завершении
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ========== API ДЛЯ КЛИЕНТА (ваши эндпоинты) ==========

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), port: PORT });
});

// Информация
app.get('/api/info', (req, res) => {
    res.json({
        status: 'running',
        port: PORT,
        bot: 'active',
        endpoints: ['/api/health', '/api/info', '/api/create_chat', '/api/connect_chat', '/api/send_message', '/api/send_image', '/api/get_messages']
    });
});

// Создание чата
app.post('/api/create_chat', (req, res) => {
    const { username } = req.body;
    console.log('📨 Создание чата:', username);

    const chatId = Math.random().toString(36).substring(2, 10);
    const accessKey = Math.random().toString(36).substring(2, 18);

    res.json({
        success: true,
        chat_id: chatId,
        access_key: accessKey
    });
});

// Подключение к чату
app.post('/api/connect_chat', (req, res) => {
    const { chat_id, username, access_key } = req.body;
    console.log('🔗 Подключение к чату:', chat_id, username);

    res.json({
        success: true,
        messages: []
    });
});

// Отправка сообщения
app.post('/api/send_message', (req, res) => {
    const { chat_id, username, text } = req.body;
    console.log(`💬 Сообщение от ${username} в ${chat_id}: ${text}`);

    res.json({ success: true });
});

// Отправка изображения
app.post('/api/send_image', (req, res) => {
    const { chat_id, username } = req.body;
    console.log(`📷 Изображение от ${username} в ${chat_id}`);

    res.json({ success: true });
});

// Получение сообщений
app.post('/api/get_messages', (req, res) => {
    const { chat_id } = req.body;

    res.json({
        success: true,
        messages: [],
        last_timestamp: Date.now()
    });
});

// Корневой маршрут - отдаём index.html из public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`✅ Слушаем на 0.0.0.0:${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
    console.log('='.repeat(50));
});