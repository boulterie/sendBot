# bot_simple.py - работает на ХОСТИНГЕ
import asyncio
import logging
import os
import socket
import requests
import netifaces
import platform
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Токен твоего бота
TOKEN = os.getenv('BOT_TOKEN')

# Инициализация бота и диспетчера
bot = Bot(token=TOKEN)
dp = Dispatcher()


def get_all_ips():
    """Получает все IP адреса сервера"""
    ips = {
        "localhost": ["127.0.0.1"],
        "local_network": [],
        "external": [],
        "interfaces": {}
    }

    # Получаем hostname
    hostname = socket.gethostname()
    ips["hostname"] = hostname

    # Получаем все сетевые интерфейсы
    try:
        for interface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(interface)
            interface_ips = []

            if netifaces.AF_INET in addrs:
                for addr in addrs[netifaces.AF_INET]:
                    ip = addr['addr']
                    interface_ips.append(ip)

                    # Классифицируем IP
                    if ip.startswith('127.'):
                        if ip not in ips["localhost"]:
                            ips["localhost"].append(ip)
                    elif ip.startswith(('10.', '172.16.', '172.17.', '172.18.', '172.19.',
                                        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
                                        '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
                                        '172.30.', '172.31.', '192.168.')):
                        ips["local_network"].append(ip)
                    else:
                        ips["external"].append(ip)

                if interface_ips:
                    ips["interfaces"][interface] = interface_ips
    except Exception as e:
        logger.error(f"Ошибка получения интерфейсов: {e}")

    # Получаем внешний IP
    try:
        ext_ip = requests.get('https://api.ipify.org', timeout=5).text.strip()
        if ext_ip and ext_ip not in ips["external"]:
            ips["external"].append(ext_ip)
    except:
        pass

    return ips


def print_server_info():
    """Выводит информацию о сервере при запуске"""
    print("\n" + "=" * 70)
    print("🚀 ЗАПУСК ПРОСТОГО БОТА")
    print("=" * 70)

    # Информация о системе
    print(f"\n📌 Система: {platform.system()} {platform.release()}")
    print(f"📌 Hostname: {socket.gethostname()}")

    # Все IP адреса
    ips = get_all_ips()

    print("\n🌐 ЛОКАЛЬНЫЕ IP (доступны внутри сервера):")
    for ip in ips["localhost"]:
        print(f"   • {ip}")

    print("\n🏠 ЛОКАЛЬНЫЕ IP (внутренняя сеть):")
    if ips["local_network"]:
        for ip in ips["local_network"]:
            print(f"   • {ip}")
    else:
        print("   • Не найдены")

    print("\n🌍 ВНЕШНИЕ IP (доступны из интернета):")
    if ips["external"]:
        for ip in ips["external"]:
            print(f"   • {ip} ⭐")
    else:
        print("   • Не найдены (возможно, сервер за NAT)")

    print("\n🔌 СЕТЕВЫЕ ИНТЕРФЕЙСЫ:")
    for interface, interface_ips in ips["interfaces"].items():
        print(f"   • {interface}: {', '.join(interface_ips)}")

    print("\n" + "=" * 70)


@dp.message(Command("start"))
async def cmd_start(message: Message):
    """Обработчик команды /start"""
    await message.reply("👋 Привет! Я простой бот для проверки IP!\n\n"
                        f"Твой chat_id: {message.chat.id}")


@dp.message(Command("ip"))
async def cmd_ip(message: Message):
    """Показать информацию о IP сервера"""
    ips = get_all_ips()

    info = "📡 **ИНФОРМАЦИЯ О СЕРВЕРЕ**\n\n"
    info += f"**Hostname:** {ips.get('hostname', 'N/A')}\n\n"

    info += "**Локальные IP:**\n"
    for ip in ips.get('localhost', []):
        info += f"• `{ip}`\n"

    info += "\n**Внутренние IP:**\n"
    for ip in ips.get('local_network', []):
        info += f"• `{ip}`\n"

    info += "\n**Внешние IP:**\n"
    for ip in ips.get('external', []):
        info += f"• `{ip}` ⭐\n"

    await message.reply(info, parse_mode="Markdown")


@dp.message()
async def echo_message(message: Message):
    """Просто отвечает тем же сообщением"""
    await message.reply(f"Ты написал: {message.text}")


async def on_startup():
    """Действия при запуске бота"""
    logger.info("🤖 Бот запущен и готов к работе!")
    print_server_info()


async def on_shutdown():
    """Действия при остановке бота"""
    logger.info("🛑 Бот остановлен")


async def main():
    """Главная функция запуска"""
    # Регистрируем обработчики
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    # Запускаем бота
    logger.info("🚀 Запуск Telegram бота...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен пользователем")