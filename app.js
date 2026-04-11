const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;  // ОБЯЗАТЕЛЬНО читаем из переменной окружения

// Обслуживание статических файлов из папки public
app.use(express.static('public'));

// API для проверки (важно для отладки)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        port: PORT,
        message: 'Server is running'
    });
});

// Корневой маршрут - отдаём index.html из папки public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запускаем сервер на 0.0.0.0 (ОБЯЗАТЕЛЬНО!)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Listening on 0.0.0.0:${PORT}`);
});