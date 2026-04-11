const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;  // BotHost сам подставит порт

// Обслуживание статических файлов из папки public
app.use(express.static('public'));

// Обработка API-запросов (ваши эндпоинты)
app.use(express.json({ limit: '50mb' }));

// API: проверка здоровья
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API: создание чата (пример)
app.post('/api/create_chat', (req, res) => {
  const { username } = req.body;
  const chatId = Math.random().toString(36).substring(2, 8);
  const accessKey = Math.random().toString(36).substring(2, 10);

  res.json({
    success: true,
    chat_id: chatId,
    access_key: accessKey
  });
});

// API: получение сообщений (пример)
app.post('/api/get_messages', (req, res) => {
  res.json({ success: true, messages: [] });
});

// Все остальные GET-запросы отдаём index.html из папки public
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});