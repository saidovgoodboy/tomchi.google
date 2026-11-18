# Tomchi — Avtomoyka IP Kamera ANPR, Bill Acceptor Bonus va ESP32 Tizimi

**Tomchi** — o‘z-o‘ziga xizmat ko‘rsatish avtomoykalari uchun mo‘ljallangan Linux server ilovasi. U IP kameralardan ikki oqimli (Sub-stream + Main-stream) tahlil orqali O‘zbekiston davlat raqamlarini aniqlaydi, har **N**-kelishda avtomatik bonus beradi, **ESP32** orqali **P10 LED** ekranni boshqaradi va main boardga **Bill Acceptor (puls)** signali yuboradi.

---

## Asosiy imkoniyatlar

- **Ikki oqimli IP Kamera ANPR (`tomchi2` algoritmi)**: Past sifatli RTSP oqimda ROI hududi bo‘yicha kirishni aniqlash (VA-API AMD RX 580 yoki CPU), mashina kirgach 1 FPS burst rejimida 5–15 kadr olib, **80% konsensus** asosida raqamni tasdiqlash.
- **Noaniq kadrlar navbati (Pending)**: Agar 80% ga yetmasa, operator telefonidan rasmga qarab raqamni qo‘lda tasdiqlashi yoki rad etishi mumkin.
- **Yagona faol bonus qoidasi**: Butun moyka bo‘yicha bir vaqtda faqat bitta avtomobilga faol bonus beriladi; navbatdagi bonusli mashina kelganda avvalgisi avtomatik yopiladi.
- **Bill Acceptor (puls) integratsiyasi**: Mijoz boxdagi tugmani bosganda ESP32 main boardning Bill Acceptor kirishiga sozlanadigan puls va pauza (`ms`) bilan kredit impulsini yuboradi. Idempotentlik (`press_id`) va admin paneldan **impulsni qaytarish (refund)** mavjud.
- **Universal ESP32 Proshivka (`firmware/tomchi_panel/tomchi_panel.ino`)**: Barcha boxlar uchun bitta kod — yoqilganda `Tomchi-Setup` Wi-Fi orqali 6 xonali kod bilan avtomatik ulanadi (`BOX_ID` va `DEVICE_KEY` NVS xotiraga saqlanadi).
- **Telefondan masofaviy HTTPS kirish (Tailscale + PWA)**: Routerda port ochmasdan, telefon ekraniga ilova (PWA) qilib o‘rnatish, O‘zbekcha / Ruscha til va Yorug‘ / Qorong‘i mavzu.
- **Virtual simulyator rejimi**: Real kamera va ESP32 bo‘lmaganda ham barcha kelish, OCR, bonus va impuls jarayonlarini sinash imkoniyati.

---

## Tizim talablari

- **Operatsion tizim**: Ubuntu 22.04 / 24.04 yoki Debian 12 (x86_64)
- **Apparat (ixtiyoriy)**: AMD Radeon RX 580 (VA-API `/dev/dri/renderD128` apparat dekodlash uchun; bo‘lmasa avtomatik CPU/Virtual rejimda ishlaydi)
- **Kameralar**: Hikvision, Dahua, Uniview yoki RTSP/ONVIF IP kameralar (1–20 tagacha box)
- **Kontroller**: ESP32 + P10 (32×16 HUB75) + Tugma + Bill Acceptor interfeysi

---

## 1. Linux serverga o‘rnatish (Ishchi muhit — Tavsiya etiladi)

O‘rnatish skripti barcha kerakli paketlarni (`Python 3`, `FFmpeg`, `Tesseract OCR`, `Mesa VA-API`, `SQLite`, `Node.js 22`), frontend buildni, `/opt/tomchi/.env` faylini va `systemd` servisini avtomatik o‘rnatadi.

### A) GitHub orqali 1 buyruqda o‘rnatish
```bash
git clone https://github.com/saidovgoodboy/tomchi.google tomchi
cd tomchi
sudo bash linux/install.sh
```

O‘rnatish yakunida terminalda yaratilgan **Admin parol** va manzil chiqadi.

### B) Tailscale orqali telefondan HTTPS kirishni yoqish
Agar o‘rnatish paytida Tailscale hali ulanmagan bo‘lsa:
```bash
sudo tailscale up
sudo tailscale serve --bg 8000
```
Shundan so‘ng Tailscale bergan `https://<mashina-nomi>.ts.net` manzilini telefondan ochib, brauzer menyusidan **«Asosiy ekranga qo‘shish» (Install App)** orqali PWA ilova sifatida o‘rnatishingiz mumkin.

### C) `.deb` paket yig‘ish (ixtiyoriy)
```bash
sudo bash linux/build-deb.sh
sudo dpkg -i build_deb/tomchi_2.0.0_amd64.deb
```

### Servisni boshqarish buyruqlari
```bash
sudo systemctl status tomchi        # Holatni ko'rish
sudo systemctl restart tomchi       # Qayta ishga tushirish
sudo journalctl -u tomchi -f        # Jonli loglarni kuzatish
```

---

## 2. Lokal ishlab chiqish va sinov (Uskunalarsiz)

Kompyuterda tez sinab ko‘rish uchun (Node.js + Express + Vite PWA + Virtual simulyator):
```bash
npm install
npm run dev
```
Ilova `http://localhost:3000` portida ochiladi.

Agar faqat Python FastAPI backendni lokal test qilmoqchi bo‘lsangiz:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Avtomatik testlarni ishga tushirish:
```bash
PYTHONPATH=backend python3 backend/tests/test_pipeline.py -v
```

---

## 3. Admin panel bo‘limlari va funksiyalari

### 1. Boxlar (`Boxes`)
- **Umumiy ko‘rsatkichlar**: Jami boxlar (`1–20`), hozir band boxlar, faol bonus summasi va tasdiq kutayotganlar soni.
- **Box kartalari**: Har bir box holati (`Bo‘sh`, `Kirish tekshirilmoqda`, `Raqam o‘qilmoqda`, `Yuvilmoqda`), ulangan kamera IP yoki Virtual holat, P10 holati va jonli P10 matnini ko‘rsatadi.
- **Mashina kirishini sinash / Chiqdi**: Virtual rejimda 1 FPS ANPR oqimini sinash va chiqishni simulyatsiya qilish.
- **Qo‘lda kelish qo‘shish**: Kamera o‘qimasa yoki tezkor kiritish kerak bo‘lganda box va davlat raqamini (masalan, `01A777BC`) qo‘lda ro‘yxatga olish.
- **Raqamni tasdiqlash (Pending)**: 80% konsensusga yetmagan holatlarda rasmga qarab raqamni tahrirlab **Tasdiqlash** yoki **Rad etish**.
- **Faol bonusni bekor qilish**: Istalgan boxdagi faol bonusni qo‘lda to‘xtatish.

### 2. Kelishlar (`Kelishlar / Визиты`)
- **Statistika**: Bugungi kelishlar, jami kelishlar, berilgan bonus va sarflangan impuls summalari.
- **3 ta ichki bo‘lim**:
  - *Kelishlar*: Box filtri va raqam qidiruvi bilan to‘liq ro‘yxat.
  - *Avtomobillar*: Har bir raqam bo‘yicha necha marta kelgani, jami olgan bonusi va navbatdagi bonusgacha progress (`3/5`).
  - *Impulslar*: Yuborilgan Bill Acceptor impulslari va xato yechilgan impulsni **Qaytarish (Refund)** tugmasi.
- **CSV eksport**: Barcha kelishlarni Excel/jadval uchun `tomchi-visits.csv` fayli sifatida yuklab olish.

### 3. Bonus (`Bonus / Бонус`)
- **Bonus qoidalari**:
  - Har necha kelishda bonus berilishi (`1–50`)
  - Bonus summasi (so‘m)
  - 1 marta tugma bosishda yechiladigan summa (so‘m)
- **Bill Acceptor (puls) sozlamalari**:
  - 1 ta Bill Acceptor pulsi qiymati (so‘m)
  - Puls davomiyligi (`ms`) va pulslar orasidagi pauza (`ms`)
- **P10 LED ekran matn shablonlari**:
  - Bo‘sh holatda (`AVTOMOBIL YO'Q`)
  - Oddiy kelishda (`{PLATE} - {VISIT}-KELISH`)
  - Faol bonusda (`{PLATE} - MUKOFOT {BONUS} SO'M`)
- **Faol bonus va P10 tugma simulyatori**: Real boxdagi tugmani bosgandek impuls yuborishni sinash yoki bonusni bekor qilish.

### 4. Sozlash (`Sozlash / Настройки`)
- **Kamera va ANPR**:
  - Box nomini o‘zgartirish / boxni o‘chirish (kamida 1 ta box qoladi).
  - *Virtual (Test)* ↔ *Real IP Kamera* rejimini almashtirish.
  - Brend tanlash (`Hikvision`, `Dahua`, `Uniview`, `Generic ONVIF`), IP, login/parol kiritib Sub-stream, Main-stream RTSP va Snapshot HTTP URL manzillarini avtomatik yasash.
  - Rasm ustida barmoq yoki sichqoncha bilan **ROI hududini** chizish.
  - `AMD RX 580 VA-API` apparat dekodlashni yoqish.
  - **ANPR qaror chegaralari**: Kelishuv (`%`), Min kadrlar, Oyna hajmi, Max kadrlar, Bo‘sh kadrda bekor qilish, OCR timeout va **1 FPS CaptureSession** test simulyatori.
- **ESP32 va Loglar**:
  - Tanlangan box uchun **6 xonali ulash kodini** olish va ulanishni sinash.
  - `DEVICE_KEY` (`X-Device-Key`) ni ko‘rish, nusxalash va saqlash.
  - Ichki o‘rnatilgan `firmware/tomchi_panel/tomchi_panel.ino` kodini ko‘rish, nusxalash yoki `.ino` fayl sifatida yuklab olish.
  - `DeviceLog` hodisalar jurnalini ko‘rish va tozalash.
- **Tailscale va Server**:
  - Tailscale MagicDNS manzilini saqlash va nusxalash.
  - **Linux server diagnostikasi**: FFmpeg, Tesseract OCR, AMD RX 580 VA-API (`/dev/dri/renderD128`) va jonli Tailscale holatini tekshirish.
- **Xavfsizlik va Ilova**:
  - Admin panel login/parol qulfini yoqish/o‘chirish (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
  - Server va muhit sozlamalari: `APP_ENV`, `PORT`, `DEVICE_KEY`, `ADMIN_TOKEN_SECRET`, `ANPR_ENABLED`, `USE_VAAPI`, `VAAPI_DEVICE`, vaqt mintaqasi (`UTC+5` / `UTC+3`).
  - **`.env nusxa olish`**: Barcha kiritilgan parametrlarni Linux `/opt/tomchi/.env` formatida bir bosishda nusxalash.
  - Interfeys tili (**O‘zbekcha / Русский**), **Yorug‘ / Qorong‘i** mavzu va **PWA o‘rnatish**.

---

## 4. ESP32 va P10 (HUB75) ulash qo‘llanmasi

### Pinlar (`firmware/tomchi_panel/tomchi_panel.ino`)
| Funksiya | ESP32 GPIO | Izoh |
|---|---|---|
| Bonus tugma kirishi | `GPIO 32` | `INPUT_PULLUP` (GND ga ulanadi) |
| Bill Acceptor puls chiqishi | `GPIO 33` | Optocoupler / tranzistor orqali main boardga |
| Zavod sozlamasiga qaytarish | `GPIO 0` (`BOOT`) | 4 soniya bosib turing |
| P10 (32×16 HUB75) | `25, 26, 27, 14, 12, 13, 23, 19, 5, 17, 4, 15, 16` | HUB75 DMA ulanish |

### ESP32 ni tarmoqqa ulash
1. Firmware'ni Arduino IDE (`ESP32-HUB75-MatrixPanel-I2S-DMA` + `ArduinoJson v7+` kutubxonalari bilan) yoki Linuxda USB orqali yuklang:
   ```bash
   esptool.py --chip esp32 --port /dev/ttyUSB0 write_flash 0x10000 firmware/builds/tomchi_panel.bin
   ```
2. ESP32 yoqilganda **`Tomchi-Setup`** nomli Wi-Fi nuqtasi ochiladi.
3. Telefondan shu Wi-Fi ga ulaning (`192.168.4.1` avtomatik ochiladi) va:
   - Moyka Wi-Fi nomi va paroli
   - Linux server lokal manzili (masalan: `http://192.168.1.50:8000`)
   - Admin panel (**Sozlash → ESP32 va Loglar**) dan olingan **6 xonali kod**
   ni kiriting.
4. ESP32 serverga `POST /api/devices/pair` yuborib, `box_id` va `device_key` ni o‘z xotirasiga saqlaydi va ishga tushadi.

---

## 5. Muhit o‘zgaruvchilari (`.env`)

Linux o‘rnatuvchisi `/opt/tomchi/.env` faylini avtomatik yaratadi (namuna: `linux/.env.example`):

| O‘zgaruvchi | Standart qiymat | Vazifasi |
|---|---|---|
| `APP_ENV` | `prod` | Ishchi (`prod`) yoki sinov (`dev`) rejim |
| `PORT` | `8000` | Linux FastAPI server porti |
| `DEVICE_KEY` | *(avto-yaratiladi)* | ESP32 `X-Device-Key` himoya kaliti |
| `ADMIN_USERNAME` | `admin` | Admin panel logini |
| `ADMIN_PASSWORD` | *(avto-yaratiladi)* | Admin panel paroli |
| `ADMIN_TOKEN_SECRET` | *(avto-yaratiladi)* | Sessiya tokeni maxfiy kaliti |
| `USE_VAAPI` | `true` | AMD RX 580 VA-API apparat dekodlash |
| `VAAPI_DEVICE` | `/dev/dri/renderD128` | GPU qurilma yo‘li |
| `ANPR_ENABLED` | `true` | Kameralardan raqam o‘qish oqimi |

> Bu qiymatlarning barchasini server ishga tushgach **Sozlash → Xavfsizlik va Ilova** bo‘limidan ham o‘zgartirish mumkin.

---

## Loyiha tuzilmasi

```text
├── backend/                 # Linux FastAPI + SQLite + RTSP ANPR + OCR
│   ├── app/
│   │   ├── main.py          # API marshrutlar va PWA static xizmati
│   │   ├── camera_worker.py # Ikki oqimli RTSP kuzatuv va burst yig'ish
│   │   ├── capture.py       # 80% konsensus CaptureSession
│   │   ├── ocr.py           # Tesseract OCR va O'zbekiston raqam filtri
│   │   ├── crud.py          # Bonus, Bill Acceptor, kelishlar va sozlamalar
│   │   └── provisioning.py  # RTSP URL generatori va ESP32 6-xonali ulash
│   └── tests/               # Pipeline birlik testlari
├── firmware/                # Universal ESP32 kodi (P10 + Bill Acceptor)
│   └── tomchi_panel/
├── linux/                   # Ubuntu/Debian o'rnatuvchi, systemd, .deb va .env.example
├── src/                     # React + TypeScript + Tailwind PWA Admin Panel
└── server.ts                # Lokal ishlab chiqish / preview Express serveri
```
