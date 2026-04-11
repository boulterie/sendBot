const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 6712;  // Порт 6712

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ========== КОНФИГУРАЦИЯ ==========
const BOT_TOKEN = process.env.BOT_TOKEN || "ВАШ_ТОКЕН_СЮДА";
const BOT_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ========== БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('chat.db');

db.serialize(() => {
  // Таблица чатов
  db.run(`CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT PRIMARY KEY,
    access_key TEXT,
    created_at INTEGER
  )`);

  // Таблица сообщений
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    username TEXT,
    type TEXT,
    content TEXT,
    image_data TEXT,
    timestamp INTEGER
  )`);

  console.log('✅ База данных инициализирована');
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function generateAccessKey() {
  return crypto.randomBytes(8).toString('hex');
}

function generateChatId() {
  return crypto.randomBytes(4).toString('hex');
}

// ========== TELEGRAM ФУНКЦИИ ==========
async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`${BOT_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Ошибка отправки в Telegram:', error.message);
  }
}

// ========== API ДЛЯ КЛИЕНТА ==========

// Корневой маршрут
app.get('/', (req, res) => {
  res.json({
    name: 'Telegram Messenger Bot',
    version: '1.0.0',
    port: PORT,
    status: 'running',
    endpoints: ['/api/health', '/api/info', '/api/create_chat', '/api/connect_chat', '/api/send_message', '/api/send_image', '/api/get_messages']
  });
});

// Проверка здоровья
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, timestamp: Date.now() });
});

// Информация о сервере
app.get('/api/info', (req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    bot_token: BOT_TOKEN ? BOT_TOKEN.substring(0, 10) + '...' : 'not set',
    endpoints: ['/', '/api/health', '/api/info', '/api/create_chat', '/api/connect_chat', '/api/send_message', '/api/send_image', '/api/get_messages']
  });
});

// Создание чата
app.post('/api/create_chat', (req, res) => {
  const { username, telegram_id } = req.body;

  console.log(`📨 Создание чата пользователем: ${username}`);

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  const chatId = generateChatId();
  const accessKey = generateAccessKey();

  db.run(
    'INSERT INTO chats (chat_id, access_key, created_at) VALUES (?, ?, ?)',
    [chatId, accessKey, Date.now()],
    (err) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Добавляем системное сообщение
      db.run(
        'INSERT INTO messages (chat_id, username, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
        [chatId, 'system', 'system', `Чат создан пользователем ${username}`, Date.now()]
      );

      console.log(`✅ Чат создан: ${chatId}, ключ: ${accessKey}`);

      res.json({
        success: true,
        chat_id: chatId,
        access_key: accessKey
      });
    }
  );
});

// Подключение к чату
app.post('/api/connect_chat', (req, res) => {
  const { chat_id, username, client_id, access_key } = req.body;

  console.log(`🔗 Подключение к чату ${chat_id} пользователем ${username}`);

  if (!chat_id || !username) {
    return res.status(400).json({ error: 'chat_id and username required' });
  }

  // Проверяем чат и ключ доступа
  db.get('SELECT access_key FROM chats WHERE chat_id = ?', [chat_id], (err, row) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      console.log(`❌ Чат ${chat_id} не найден`);
      return res.status(404).json({ error: 'Чат не найден' });
    }

    if (access_key && row.access_key !== access_key) {
      console.log(`❌ Неверный ключ доступа для чата ${chat_id}`);
      return res.status(403).json({ error: 'Неверный ключ доступа' });
    }

    // Получаем историю сообщений
    db.all(
      'SELECT username, type, content, image_data, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp LIMIT 100',
      [chat_id],
      (err, messages) => {
        if (err) {
          console.error('DB error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        // Добавляем системное сообщение о подключении
        db.run(
          'INSERT INTO messages (chat_id, username, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
          [chat_id, 'system', 'system', `Пользователь ${username} подключился`, Date.now()]
        );

        console.log(`✅ Пользователь ${username} подключен к чату ${chat_id}`);

        res.json({
          success: true,
          messages: messages || []
        });
      }
    );
  });
});

// Отправка текстового сообщения
app.post('/api/send_message', (req, res) => {
  const { chat_id, username, text, client_id } = req.body;

  console.log(`💬 Сообщение от ${username} в чат ${chat_id}: ${text}`);

  if (!chat_id || !username || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO messages (chat_id, username, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
    [chat_id, username, 'text', text, Date.now()],
    (err) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log(`✅ Сообщение сохранено`);
      res.json({ success: true });
    }
  );
});

// Отправка изображения
app.post('/api/send_image', (req, res) => {
  const { chat_id, username, image_base64, client_id } = req.body;

  console.log(`📷 Изображение от ${username} в чат ${chat_id}`);

  if (!chat_id || !username || !image_base64) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO messages (chat_id, username, type, image_data, timestamp) VALUES (?, ?, ?, ?, ?)',
    [chat_id, username, 'image', image_base64, Date.now()],
    (err) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log(`✅ Изображение сохранено`);
      res.json({ success: true });
    }
  );
});

// Получение новых сообщений (long polling)
app.post('/api/get_messages', (req, res) => {
  const { chat_id, last_timestamp } = req.body;

  if (!chat_id) {
    return res.status(400).json({ error: 'chat_id required' });
  }

  const timestamp = last_timestamp || 0;

  // Long polling: ждём новые сообщения до 25 секунд
  const timeout = 25000;
  const startTime = Date.now();

  function checkMessages() {
    db.all(
      'SELECT username, type, content, image_data, timestamp FROM messages WHERE chat_id = ? AND timestamp > ? ORDER BY timestamp',
      [chat_id, timestamp],
      (err, messages) => {
        if (err) {
          console.error('DB error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (messages && messages.length > 0) {
          // Есть новые сообщения
          const lastTs = messages[messages.length - 1].timestamp;
          console.log(`📬 Новые сообщения для чата ${chat_id}: ${messages.length} шт.`);
          return res.json({
            success: true,
            messages: messages,
            last_timestamp: lastTs
          });
        }

        if (Date.now() - startTime < timeout) {
          // Ждём ещё 1 секунду
          setTimeout(checkMessages, 1000);
        } else {
          // Таймаут - нет новых сообщений
          return res.json({
            success: true,
            messages: [],
            last_timestamp: timestamp
          });
        }
      }
    );
  }

  checkMessages();
});

// ========== TELEGRAM POLLING ==========
let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const response = await axios.get(`${BOT_API_URL}/getUpdates`, {
      params: {
        offset: lastUpdateId + 1,
        timeout: 30
      }
    });

    const updates = response.data.result || [];

    for (const update of updates) {
      lastUpdateId = update.update_id;

      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text || '';
        const userName = msg.from.first_name || 'Пользователь';

        if (text === '/start') {
          await sendTelegramMessage(chatId,
            '🤖 <b>Telegram Messenger Bot</b>\n\n'
            + 'Этот бот работает как сервер для мессенджера.\n'
            + 'Используйте клиентское приложение для общения.\n\n'
            + `📡 Сервер: порт ${PORT}\n`
            + `👤 Ваш ID: ${chatId}`
          );
          console.log(`📱 Пользователь ${userName} (${chatId}) запустил бота`);
        } else if (text === '/info') {
          await sendTelegramMessage(chatId,
            `📊 <b>Информация о сервере</b>\n\n`
            + `Порт: ${PORT}\n`
            + `Статус: активен\n`
            + `БД: SQLite\n`
            + `Время: ${new Date().toLocaleString()}`
          );
        } else if (text === '/ping') {
          await sendTelegramMessage(chatId, '🏓 Pong!');
        }
      }
    }
  } catch (error) {
    console.error('Polling error:', error.message);
  }

  setTimeout(pollTelegram, 1000);
}

// ========== ЗАПУСК ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Telegram Messenger Bot запущен`);
  console.log(`📡 Порт: ${PORT}`);
  console.log(`🌐 Локальный адрес: http://localhost:${PORT}`);
  console.log(`✅ API готов к работе`);
  console.log('='.repeat(50));

  // Запускаем polling для Telegram
  if (BOT_TOKEN && BOT_TOKEN !== 'ВАШ_ТОКЕН_СЮДА') {
    pollTelegram();
    console.log('🔄 Telegram polling запущен');
  } else {
    console.log('⚠️ ВНИМАНИЕ: BOT_TOKEN не настроен!');
    console.log('   Добавьте переменную окружения BOT_TOKEN');
  }
});