import json
import os
import sqlite3
import time
import requests
import hashlib
import secrets
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ========== КОНФИГУРАЦИЯ ==========
BOT_TOKEN = os.getenv('BOT_TOKEN')  # Замените на ваш токен
BOT_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
SERVER_URL = os.getenv('SERVER_URL')  # Замените на ваш публичный адрес


# ========== ИНИЦИАЛИЗАЦИЯ БД ==========
def init_db():
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()

    # Таблица чатов
    c.execute('''CREATE TABLE IF NOT EXISTS chats
                 (chat_id TEXT PRIMARY KEY,
                  creator_telegram_id INTEGER,
                  created_at INTEGER,
                  access_key TEXT)''')

    # Таблица сообщений
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  chat_id TEXT,
                  user_id TEXT,
                  username TEXT,
                  type TEXT,
                  content TEXT,
                  timestamp INTEGER,
                  image_data BLOB)''')

    # Таблица подключённых клиентов (сессии)
    c.execute('''CREATE TABLE IF NOT EXISTS sessions
                 (client_id TEXT PRIMARY KEY,
                  chat_id TEXT,
                  telegram_id INTEGER,
                  username TEXT,
                  last_seen INTEGER)''')

    conn.commit()
    conn.close()


init_db()


# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
def generate_access_key(chat_id):
    """Генерирует ключ доступа для чата"""
    secret = secrets.token_hex(16)
    return hashlib.sha256(f"{chat_id}:{secret}".encode()).hexdigest()[:16]


def send_telegram_message(telegram_id, text):
    """Отправляет сообщение пользователю в Telegram"""
    url = f"{BOT_API_URL}/sendMessage"
    payload = {"chat_id": telegram_id, "text": text, "parse_mode": "HTML"}
    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.json()
    except Exception as e:
        print(f"Ошибка отправки в Telegram: {e}")
        return None


def send_telegram_photo(telegram_id, image_data, caption=""):
    """Отправляет фото в Telegram"""
    url = f"{BOT_API_URL}/sendPhoto"
    files = {"photo": ("image.jpg", image_data)}
    data = {"chat_id": telegram_id, "caption": caption}
    try:
        response = requests.post(url, data=data, files=files, timeout=30)
        return response.json()
    except Exception as e:
        print(f"Ошибка отправки фото: {e}")
        return None


def get_chat_info(chat_id):
    """Получает информацию о чате"""
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("SELECT creator_telegram_id, access_key FROM chats WHERE chat_id=?", (chat_id,))
    result = c.fetchone()
    conn.close()
    if result:
        return {"telegram_id": result[0], "access_key": result[1]}
    return None


def save_message(chat_id, user_id, username, msg_type, content, image_data=None):
    """Сохраняет сообщение в БД"""
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("""INSERT INTO messages (chat_id, user_id, username, type, content, timestamp, image_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)""",
              (chat_id, user_id, username, msg_type, content, int(time.time()), image_data))
    conn.commit()
    conn.close()


def get_messages(chat_id, limit=100):
    """Получает последние сообщения из чата"""
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("""SELECT user_id, username, type, content, timestamp, image_data 
                 FROM messages WHERE chat_id=? 
                 ORDER BY timestamp DESC LIMIT ?""", (chat_id, limit))
    messages = []
    for row in c.fetchall():
        msg = {
            "user_id": row[0],
            "username": row[1],
            "type": row[2],
            "content": row[3],
            "timestamp": row[4]
        }
        if row[5]:
            import base64
            msg["image_data"] = base64.b64encode(row[5]).decode('ascii')
        messages.append(msg)
    conn.close()
    return messages[::-1]  # В хронологическом порядке


def register_client(client_id, chat_id, telegram_id, username):
    """Регистрирует клиентскую сессию"""
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("""INSERT OR REPLACE INTO sessions (client_id, chat_id, telegram_id, username, last_seen)
                 VALUES (?, ?, ?, ?, ?)""",
              (client_id, chat_id, telegram_id, username, int(time.time())))
    conn.commit()
    conn.close()


def notify_clients(chat_id, message_data):
    """Оповещает всех клиентов в чате о новом сообщении"""
    # В реальном приложении здесь может быть WebSocket или Server-Sent Events
    # Для простоты клиенты сами опрашивают сервер
    pass


# ========== API ДЛЯ КЛИЕНТА ==========

@app.route('/api/create_chat', methods=['POST'])
def create_chat():
    """Создаёт новый чат"""
    data = request.json
    username = data.get('username')
    telegram_id = data.get('telegram_id')

    if not username:
        return jsonify({"error": "Username required"}), 400

    # Генерируем ID чата
    chat_id = secrets.token_hex(4)  # 8 символов

    # Сохраняем чат
    access_key = generate_access_key(chat_id)
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("INSERT INTO chats (chat_id, creator_telegram_id, created_at, access_key) VALUES (?, ?, ?, ?)",
              (chat_id, telegram_id, int(time.time()), access_key))
    conn.commit()
    conn.close()

    # Добавляем системное сообщение
    save_message(chat_id, "system", "system", "system", f"Чат создан пользователем {username}")

    return jsonify({
        "success": True,
        "chat_id": chat_id,
        "access_key": access_key,
        "message": f"Чат {chat_id} создан"
    })


@app.route('/api/connect_chat', methods=['POST'])
def connect_chat():
    """Подключается к существующему чату"""
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    client_id = data.get('client_id')  # Уникальный ID клиента
    access_key = data.get('access_key')

    # Проверяем существование чата
    chat_info = get_chat_info(chat_id)
    if not chat_info:
        return jsonify({"error": "Чат не найден"}), 404

    # Проверяем ключ доступа
    if access_key != chat_info['access_key']:
        return jsonify({"error": "Неверный ключ доступа"}), 403

    # Регистрируем клиента
    register_client(client_id, chat_id, chat_info['telegram_id'], username)

    # Добавляем системное сообщение
    save_message(chat_id, "system", "system", "system", f"Пользователь {username} подключился")

    # Получаем историю сообщений
    messages = get_messages(chat_id)

    return jsonify({
        "success": True,
        "chat_id": chat_id,
        "messages": messages,
        "telegram_bot": BOT_TOKEN.split(':')[0]  # Имя бота для отображения
    })


@app.route('/api/send_message', methods=['POST'])
def send_message():
    """Отправляет сообщение в чат"""
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    text = data.get('text')
    client_id = data.get('client_id')

    chat_info = get_chat_info(chat_id)
    if not chat_info:
        return jsonify({"error": "Чат не найден"}), 404

    # Сохраняем сообщение
    save_message(chat_id, client_id, username, "text", text)

    # Отправляем в Telegram, если пользователь подписан
    if chat_info['telegram_id']:
        send_telegram_message(chat_info['telegram_id'],
                              f"💬 <b>{username}</b> в чате {chat_id}:\n{text}")

    return jsonify({"success": True})


@app.route('/api/send_image', methods=['POST'])
def send_image():
    """Отправляет изображение в чат"""
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    client_id = data.get('client_id')
    image_base64 = data.get('image_base64')

    import base64
    image_data = base64.b64decode(image_base64)

    chat_info = get_chat_info(chat_id)
    if not chat_info:
        return jsonify({"error": "Чат не найден"}), 404

    # Сохраняем изображение
    save_message(chat_id, client_id, username, "image", "", image_data)

    # Отправляем в Telegram
    if chat_info['telegram_id']:
        send_telegram_photo(chat_info['telegram_id'], image_data,
                            f"📷 <b>{username}</b> в чате {chat_id}")

    return jsonify({"success": True})


@app.route('/api/get_messages', methods=['POST'])
def get_messages_api():
    """Получает новые сообщения (long polling)"""
    data = request.json
    chat_id = data.get('chat_id')
    last_timestamp = data.get('last_timestamp', 0)

    # Ждём новые сообщения (до 25 секунд)
    timeout = 25
    start_time = time.time()

    while time.time() - start_time < timeout:
        messages = get_messages(chat_id)
        if messages and messages[-1]['timestamp'] > last_timestamp:
            # Фильтруем только новые
            new_messages = [m for m in messages if m['timestamp'] > last_timestamp]
            if new_messages:
                return jsonify({
                    "success": True,
                    "messages": new_messages,
                    "last_timestamp": messages[-1]['timestamp']
                })
        time.sleep(1)

    return jsonify({"success": True, "messages": [], "last_timestamp": last_timestamp})


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ========== TELEGRAM WEBHOOK ==========
@app.route(f'/webhook/{BOT_TOKEN}', methods=['POST'])
def telegram_webhook():
    """Обрабатывает входящие сообщения от Telegram"""
    update = request.get_json()

    if not update or 'message' not in update:
        return jsonify({"ok": True})

    message = update['message']
    telegram_id = message['chat']['id']
    text = message.get('text', '')
    username = message['from'].get('first_name', 'Пользователь')

    # Обработка команд от пользователя в Telegram
    if text == '/start':
        send_telegram_message(telegram_id,
                              "🤖 <b>Чат-бот для мессенджера</b>\n\n"
                              "Этот бот пересылает сообщения из вашего клиента в Telegram.\n"
                              "Используйте клиентское приложение для общения.\n\n"
                              f"<i>Ваш ID в системе: {telegram_id}</i>")

    elif text.startswith('/chat'):
        # Пользователь запрашивает последние сообщения из чата
        parts = text.split()
        if len(parts) == 2:
            chat_id = parts[1]
            messages = get_messages(chat_id, limit=10)
            if messages:
                response = f"📋 <b>Последние сообщения чата {chat_id}:</b>\n\n"
                for msg in messages[-10:]:
                    response += f"👤 {msg['username']}: {msg['content'][:100]}\n"
                send_telegram_message(telegram_id, response)
            else:
                send_telegram_message(telegram_id, f"❌ Чат {chat_id} пуст или не существует")

    return jsonify({"ok": True})


@app.route('/set_webhook', methods=['GET'])
def set_webhook():
    """Устанавливает вебхук (вызовите один раз)"""
    webhook_url = f"{SERVER_URL}/webhook/{BOT_TOKEN}"
    url = f"{BOT_API_URL}/setWebhook?url={webhook_url}"
    response = requests.get(url)
    return jsonify(response.json())


# ========== ЗАПУСК ==========
if __name__ == '__main__':
    print("🚀 Сервер запущен")
    print(f"🤖 Bot token: {BOT_TOKEN[:10]}...")
    print(f"📍 API доступен по адресу: {SERVER_URL}")
    print("\n🔧 Установите вебхук, вызвав:")
    print(f"   GET {SERVER_URL}/set_webhook")
    app.run(host='0.0.0.0', port=5000, debug=True)