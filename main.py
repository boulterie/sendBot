from flask import Flask, request, jsonify
from flask_cors import CORS
import secrets
import time

app = Flask(__name__)
CORS(app)

# Корневой маршрут - чтобы не было 404
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "ok",
        "message": "Бот работает",
        "time": time.time()
    })

# API эндпоинты
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": time.time()})

@app.route('/api/info', methods=['GET'])
def info():
    return jsonify({
        "status": "running",
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

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 БОТ ЗАПУЩЕН")
    print("🌐 Адрес: http://apsendler.bothost.ru")
    print("📡 Проверьте: http://apsendler.bothost.ru/api/health")
    print("=" * 50)
    app.run(host='0.0.0.0', port=80, debug=False)