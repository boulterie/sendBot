const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;  // Явно указываем порт, БЕЗ process.env

// Обслуживание статических файлов из папки public
app.use(express.static('public'));

// API для проверки
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), port: PORT });
});

// Корневой маршрут - отдаём index.html из папки public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запускаем сервер на 0.0.0.0, порт 3000
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});