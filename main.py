import os

import requests
import time
import threading
import sqlite3
import secrets
import base64
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ========== КОНФИГУРАЦИЯ ==========
BOT_TOKEN = os.getenv('BOT_TOKEN')  # ВСТАВЬТЕ ВАШ ТОКЕН
BOT_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"


# ========== БАЗА ДАННЫХ ==========
def init_db():
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS chats
                 (chat_id TEXT PRIMARY KEY, access_key TEXT, created_at INTEGER)''')
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, 
                  username TEXT, type TEXT, content TEXT, timestamp INTEGER, image_data BLOB)''')
    conn.commit()
    conn.close()
    print("✅ База данных готова")


init_db()


# ========== API ДЛЯ КЛИЕНТА ==========
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route('/api/info', methods=['GET'])
def info():
    return jsonify({"status": "running", "bot": "active"})


@app.route('/api/create_chat', methods=['POST'])
def create_chat():
    data = request.json
    username = data.get('username', 'User')
    chat_id = secrets.token_hex(4)
    access_key = secrets.token_hex(8)

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("INSERT INTO chats (chat_id, access_key, created_at) VALUES (?, ?, ?)",
              (chat_id, access_key, int(time.time())))
    c.execute("INSERT INTO messages (chat_id, username, type, content, timestamp) VALUES (?, ?, ?, ?, ?)",
              (chat_id, "system", "system", f"Чат создан пользователем {username}", int(time.time())))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "chat_id": chat_id, "access_key": access_key})


@app.route('/api/connect_chat', methods=['POST'])
def connect_chat():
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    access_key = data.get('access_key')

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("SELECT access_key FROM chats WHERE chat_id=?", (chat_id,))
    result = c.fetchone()

    if not result:
        conn.close()
        return jsonify({"error": "Чат не найден"}), 404

    if access_key and result[0] != access_key:
        conn.close()
        return jsonify({"error": "Неверный ключ доступа"}), 403

    c.execute("SELECT username, type, content, timestamp FROM messages WHERE chat_id=? ORDER BY timestamp LIMIT 50",
              (chat_id,))
    messages = []
    for row in c.fetchall():
        messages.append({"username": row[0], "type": row[1], "content": row[2], "timestamp": row[3]})

    conn.close()
    return jsonify({"success": True, "messages": messages})


@app.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    text = data.get('text')

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("INSERT INTO messages (chat_id, username, type, content, timestamp) VALUES (?, ?, ?, ?, ?)",
              (chat_id, username, "text", text, int(time.time())))
    conn.commit()
    conn.close()

    return jsonify({"success": True})


@app.route('/api/send_image', methods=['POST'])
def send_image():
    data = request.json
    chat_id = data.get('chat_id')
    username = data.get('username')
    image_base64 = data.get('image_base64')

    image_data = base64.b64decode(image_base64)

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("INSERT INTO messages (chat_id, username, type, image_data, timestamp) VALUES (?, ?, ?, ?, ?)",
              (chat_id, username, "image", image_data, int(time.time())))
    conn.commit()
    conn.close()

    return jsonify({"success": True})


@app.route('/api/get_messages', methods=['POST'])
def get_messages():
    data = request.json
    chat_id = data.get('chat_id')
    last_timestamp = data.get('last_timestamp', 0)

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute(
        "SELECT username, type, content, timestamp, image_data FROM messages WHERE chat_id=? AND timestamp>? ORDER BY timestamp",
        (chat_id, last_timestamp))

    messages = []
    for row in c.fetchall():
        msg = {"username": row[0], "type": row[1], "content": row[2], "timestamp": row[3]}
        if row[4]:
            msg["image_data"] = base64.b64encode(row[4]).decode('ascii')
        messages.append(msg)

    conn.close()
    return jsonify({"success": True, "messages": messages})


# ========== TELEGRAM POLLING ==========
last_update_id = 0


def send_telegram_message(chat_id, text):
    try:
        requests.post(f"{BOT_API_URL}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=10)
    except Exception as e:
        print(f"Ошибка: {e}")


def polling_loop():
    global last_update_id
    print("🔄 Telegram polling запущен...")
    while True:
        try:
            url = f"{BOT_API_URL}/getUpdates"
            params = {"offset": last_update_id + 1, "timeout": 20}
            response = requests.get(url, params=params, timeout=25)

            if response.status_code == 200:
                for update in response.json().get("result", []):
                    last_update_id = update["update_id"]
                    if "message" in update:
                        msg = update["message"]
                        chat_id = msg["chat"]["id"]
                        text = msg.get("text", "")
                        if text == "/start":
                            send_telegram_message(chat_id, "✅ Бот работает! Используйте клиент для общения.")
        except:
            pass
        time.sleep(1)


# ========== ЗАПУСК ==========
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 ПРОСТОЙ БОТ ЗАПУЩЕН")
    print("=" * 50)

    # Запускаем polling
    threading.Thread(target=polling_loop, daemon=True).start()

    # Запускаем сервер на ВСЕХ интерфейсах
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)