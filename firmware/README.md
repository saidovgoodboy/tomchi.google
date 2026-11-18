# Tomchi Universal ESP32 Firmware (`tomchi_panel`)

Bitta universal proshivka barcha moyka boxlari uchun ishlaydi:
- Yangi ESP32 yoqilganda **`Tomchi-Setup`** nomli Wi-Fi nuqtasi ochiladi (`192.168.4.1`).
- Telefondan ulanib Wi-Fi, Linux server manzili (`http://192.168.1.50:8000`) va Admin paneldagi **6 xonali kod** kiritiladi.
- `BOX_ID` va `DEVICE_KEY` ESP32 NVS xotirasiga (`Preferences`) saqlanadi.
- Qayta sozlash uchun ESP32 dagi `BOOT` tugmasini 4 soniya bosib turing.

## Kerakli Arduino kutubxonalari
- `ESP32 HUB75 LED MATRIX PANEL DMA Display`
- `ArduinoJson` (v7+)

## Linuxda USB orqali tayyor `.bin` yozish
```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 write_flash 0x10000 firmware/builds/tomchi_panel.bin
```
