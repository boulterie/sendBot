from flask import Flask, request, jsonify
from flask_cors import CORS
import secrets
import time
import threading

app = Flask(__name__)
CORS(app)

# Корневой маршрут
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "ok",
        "message": "Бот работает на порту 6712",
        "time": time.time()
    })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": time.time()})

@app.route('/api/info', methods=['GET'])
def info():
    return jsonify({
        "status": "running",
        "port": 6712,
        "endpoints": ["/", "/api/health", "/api/info", "/api/create_chat"]
    })

@app.route('/api/create_chat', methods=['POST'])
def create_chat():
    data = request.json
    print(f"📨 Создание чата: {data}")
    chat_id = secrets.token_hex(4)
    return jsonify({
        "success": True,
        "chat_id": chat_id,
        "access_key": secrets.token_hex(8)
    })

@app.route('/api/connect_chat', methods=['POST'])
def connect_chat():
    data = request.json
    print(f"📨 Подключение к чату: {data}")
    return jsonify({
        "success": True,
        "messages": []
    })

@app.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.json
    print(f"💬 Сообщение от {data.get('username')}: {data.get('text')}")
    return jsonify({"success": True})

@app.route('/api/send_image', methods=['POST'])
def send_image():
    data = request.json
    print(f"📷 Изображение от {data.get('username')}")
    return jsonify({"success": True})

@app.route('/api/get_messages', methods=['POST'])
def get_messages():
    return jsonify({"success": True, "messages": []})

if __name__ == '__main__':
    print("=" * 50)
    print(f"🚀 БОТ ЗАПУЩЕН НА ПОРТУ 6712")
    print(f"🌐 Локальный адрес: http://localhost:6712")
    print(f"📡 Проверьте: curl http://localhost:6712/api/health")
    print("=" * 50)
    app.run(host='0.0.0.0', port=6712, debug=False)