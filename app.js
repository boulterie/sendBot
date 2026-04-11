const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT;  // BotHost сам подставит порт, НЕ ставьте значение по умолчанию!

console.log('Starting server...');
console.log('PORT from env:', PORT);

// Обслуживание статических файлов из папки public
app.use(express.static('public'));

// API для проверки
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), port: PORT });
});

// Корневой маршрут - отдаём index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});