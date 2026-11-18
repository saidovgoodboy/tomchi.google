/*
 * Tomchi — Universal ESP32 P10 (HUB75) + Bonus Tugma + Bill Acceptor Puls + Captive Portal
 *
 * Qanday ishlaydi:
 * 1. Birinchi marta yoqilganda (yoki BOOT tugmasini 4 soniya bosib ushlaganda)
 *    "Tomchi-Setup" nomli ochiq Wi-Fi nuqtasini (192.168.4.1) yoqadi.
 * 2. Telefondan Wi-Fi ga ulanib:
 *      - Moyka Wi-Fi nomi va paroli
 *      - Linux server lokal manzili (masalan: http://192.168.1.50:8000)
 *      - Admin panelda yaratilgan 6 xonali ulash kodi (masalan: 482910)
 *    kiritiladi.
 * 3. ESP32 POST /api/devices/pair ga so'rov yuborib o'zining box_id va device_key
 *    kalitlarini avtomatik oladi va NVS (Preferences) xotirasiga saqlaydi.
 * 4. Oddiy ish rejimida:
 *      - Har 1 soniyada GET /api/display?box_id=... dan P10 matnini oladi.
 *      - Tugma bosilganda POST /api/bonus/press ga idempotent press_id yuboradi
 *        va tasdiqlansa main boardning Bill Acceptor kirishiga (PULSE_OUTPUT_PIN) puls yuboradi.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

constexpr int BUTTON_PIN = 32;
constexpr int PULSE_OUTPUT_PIN = 33;
constexpr int SETUP_RESET_PIN = 0; // ESP32 BOOT button

constexpr uint16_t PANEL_WIDTH = 32;
constexpr uint16_t PANEL_HEIGHT = 16;
constexpr uint8_t PANEL_CHAIN = 1;

constexpr uint32_t DISPLAY_POLL_MS = 1000;
constexpr uint32_t SCROLL_INTERVAL_MS = 45;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 60;
constexpr uint32_t SETUP_HOLD_MS = 4000;

static HUB75_I2S_CFG::i2s_pins panelPins = {
  25, 26, 27, 14, 12, 13, 23, 19, 5, 17, -1, 4, 15, 16
};
static HUB75_I2S_CFG panelConfig(PANEL_WIDTH, PANEL_HEIGHT, PANEL_CHAIN, panelPins);
static MatrixPanel_I2S_DMA panel(panelConfig);

Preferences prefs;
WebServer portalServer(80);
DNSServer dnsServer;

String wifiSsid;
String wifiPass;
String serverUrl;
String boxId;
String deviceKey;

bool setupMode = false;
String displayText = "TOMCHI";
String lastRenderedText = "";
int scrollX = PANEL_WIDTH;
bool bonusDisplay = false;
uint16_t pulseMs = 120;
bool pulseActiveHigh = true;

uint32_t lastDisplayPollAt = 0;
uint32_t lastScrollAt = 0;
uint32_t lastWiFiAttemptAt = 0;
uint32_t setupHoldStartedAt = 0;

volatile uint8_t pendingButtonPresses = 0;
volatile uint32_t lastButtonInterruptAt = 0;

void IRAM_ATTR onBonusButtonISR() {
  uint32_t now = millis();
  if (now - lastButtonInterruptAt >= BUTTON_DEBOUNCE_MS) {
    lastButtonInterruptAt = now;
    if (pendingButtonPresses < 10) {
      pendingButtonPresses++;
    }
  }
}

void triggerRelayPulse(uint8_t count, uint16_t durationMs) {
  for (uint8_t i = 0; i < count; i++) {
    digitalWrite(PULSE_OUTPUT_PIN, pulseActiveHigh ? HIGH : LOW);
    delay(durationMs);
    digitalWrite(PULSE_OUTPUT_PIN, pulseActiveHigh ? LOW : HIGH);
    if (i + 1 < count) delay(80);
  }
}

void loadConfig() {
  prefs.begin("tomchi", true);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  serverUrl = prefs.getString("server", "");
  boxId = prefs.getString("box_id", "");
  deviceKey = prefs.getString("dev_key", "");
  prefs.end();
}

void saveConfig(const String& ssid, const String& pass, const String& server,
                const String& bId, const String& dKey) {
  prefs.begin("tomchi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("server", server);
  prefs.putString("box_id", bId);
  prefs.putString("dev_key", dKey);
  prefs.end();
}

void clearConfig() {
  prefs.begin("tomchi", false);
  prefs.clear();
  prefs.end();
}

String setupPageHtml(const String& errorMsg = "") {
  String html = R"rawliteral(
<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tomchi ESP32 Sozlash</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:20px}
  .card{max-width:400px;margin:0 auto;background:#1e293b;border-radius:14px;padding:20px;border:1px solid #334155}
  h1{margin:0 0 8px;font-size:20px}
  p{margin:0 0 16px;font-size:13px;color:#94a3b8}
  label{display:block;font-size:13px;margin:12px 0 4px;color:#cbd5e1}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:15px}
  button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#0284c7;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .err{background:#7f1d1d;color:#fecaca;padding:10px;border-radius:8px;font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<div class="card">
  <h1>Tomchi P10 Ulash</h1>
  <p>Admin paneldan olingan 6 xonali kodni va moyka Wi-Fi ma'lumotlarini kiriting.</p>
)rawliteral";
  if (errorMsg.length() > 0) {
    html += "<div class='err'>" + errorMsg + "</div>";
  }
  html += R"rawliteral(
  <form method="POST" action="/save">
    <label>Wi-Fi nomi (SSID)</label>
    <input name="ssid" required placeholder="Moyka_WiFi">
    <label>Wi-Fi paroli</label>
    <input name="pass" type="password" placeholder="••••••••">
    <label>Linux Server manzili (LAN)</label>
    <input name="server" required value="http://192.168.1.50:8000">
    <label>6 xonali ulash kodi</label>
    <input name="code" required maxlength="6" pattern="[0-9]{6}" placeholder="482910">
    <button type="submit">Ulash va Saqlash</button>
  </form>
</div>
</body>
</html>
)rawliteral";
  return html;
}

void startCaptivePortal() {
  setupMode = true;
  displayText = "SETUP: TOMCHI-SETUP";
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("Tomchi-Setup");
  dnsServer.start(53, "*", WiFi.softAPIP());

  portalServer.on("/", HTTP_GET, []() {
    portalServer.send(200, "text/html", setupPageHtml());
  });

  portalServer.onNotFound([]() {
    portalServer.send(200, "text/html", setupPageHtml());
  });

  portalServer.on("/save", HTTP_POST, []() {
    String ssid = portalServer.arg("ssid");
    String pass = portalServer.arg("pass");
    String srv = portalServer.arg("server");
    String code = portalServer.arg("code");
    srv.trim();
    if (srv.endsWith("/")) srv.remove(srv.length() - 1);

    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t started = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - started < 12000) {
      delay(250);
    }
    if (WiFi.status() != WL_CONNECTED) {
      portalServer.send(200, "text/html", setupPageHtml("Wi-Fi ga ulanib bo'lmadi. SSID/parolni tekshiring."));
      return;
    }

    HTTPClient http;
    WiFiClient client;
    if (!http.begin(client, srv + "/api/devices/pair")) {
      portalServer.send(200, "text/html", setupPageHtml("Server manzili noto'g'ri."));
      return;
    }
    http.addHeader("Content-Type", "application/json");
    JsonDocument reqDoc;
    reqDoc["code"] = code;
    reqDoc["mac"] = WiFi.macAddress();
    String body;
    serializeJson(reqDoc, body);

    int status = http.POST(body);
    String resp = http.getString();
    http.end();

    if (status != 200) {
      portalServer.send(200, "text/html", setupPageHtml("Kod noto'g'ri yoki muddati o'tgan (" + String(status) + ")."));
      return;
    }

    JsonDocument respDoc;
    if (deserializeJson(respDoc, resp) != DeserializationError::Ok) {
      portalServer.send(200, "text/html", setupPageHtml("Server javobini o'qib bo'lmadi."));
      return;
    }

    String newBoxId = respDoc["box_id"].as<String>();
    String newDevKey = respDoc["device_key"].as<String>();
    if (newBoxId.isEmpty() || newDevKey.isEmpty()) {
      portalServer.send(200, "text/html", setupPageHtml("Server box_id yoki device_key bermadi."));
      return;
    }

    saveConfig(ssid, pass, srv, newBoxId, newDevKey);
    portalServer.send(200, "text/html",
      "<html><body style='font-family:sans-serif;background:#0f172a;color:#fff;padding:30px;text-align:center'>"
      "<h2>Muvaffaqiyatli ulandi!</h2><p>Box: " + newBoxId + "</p><p>ESP32 qayta ishga tushmoqda...</p></body></html>");
    delay(1500);
    ESP.restart();
  });

  portalServer.begin();
}

void renderPanel() {
  uint32_t now = millis();
  if (now - lastScrollAt < SCROLL_INTERVAL_MS && displayText == lastRenderedText) {
    return;
  }
  lastScrollAt = now;

  panel.fillScreen(0);
  panel.setTextWrap(false);
  panel.setTextSize(1);
  uint16_t color = bonusDisplay ? panel.color565(255, 190, 0) : panel.color565(0, 210, 255);
  panel.setTextColor(color);

  int16_t textWidth = (int16_t)displayText.length() * 6;
  if (textWidth <= PANEL_WIDTH) {
    panel.setCursor(max(0, (int)((PANEL_WIDTH - textWidth) / 2)), 4);
    panel.print(displayText);
  } else {
    if (displayText != lastRenderedText) {
      scrollX = PANEL_WIDTH;
    }
    panel.setCursor(scrollX, 4);
    panel.print(displayText);
    scrollX--;
    if (scrollX < -textWidth) {
      scrollX = PANEL_WIDTH;
    }
  }
  lastRenderedText = displayText;
}

void pollDisplay() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  WiFiClient client;
  String url = serverUrl + "/api/display?box_id=" + boxId;
  if (!http.begin(client, url)) return;
  http.addHeader("X-Device-Key", deviceKey);
  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
      const char* txt = doc["text"] | "TOMCHI";
      const char* st = doc["status"] | "idle";
      displayText = String(txt);
      bonusDisplay = String(st) == "bonus_active";
    }
  }
  http.end();
}

void sendBonusPress() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, serverUrl + "/api/bonus/press")) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", deviceKey);

  String pressId = boxId + "-" + String(millis()) + "-" + String(esp_random() & 0xFFFF, HEX);
  JsonDocument req;
  req["box_id"] = boxId;
  req["press_id"] = pressId;
  String payload;
  serializeJson(req, payload);

  int code = http.POST(payload);
  if (code == 200) {
    JsonDocument res;
    if (deserializeJson(res, http.getString()) == DeserializationError::Ok) {
      bool ok = res["ok"] | false;
      uint8_t pulses = res["pulse_count"] | 0;
      if (ok && pulses > 0) {
        triggerRelayPulse(pulses, pulseMs);
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(SETUP_RESET_PIN, INPUT_PULLUP);
  pinMode(PULSE_OUTPUT_PIN, OUTPUT);
  digitalWrite(PULSE_OUTPUT_PIN, pulseActiveHigh ? LOW : HIGH);

  panel.begin();
  panel.setBrightness8(95);

  loadConfig();
  if (wifiSsid.isEmpty() || serverUrl.isEmpty() || boxId.isEmpty() || deviceKey.isEmpty()) {
    startCaptivePortal();
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), onBonusButtonISR, FALLING);
}

void loop() {
  if (digitalRead(SETUP_RESET_PIN) == LOW) {
    if (setupHoldStartedAt == 0) setupHoldStartedAt = millis();
    if (millis() - setupHoldStartedAt >= SETUP_HOLD_MS) {
      clearConfig();
      ESP.restart();
    }
  } else {
    setupHoldStartedAt = 0;
  }

  if (setupMode) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    renderPanel();
    return;
  }

  uint32_t now = millis();
  if (WiFi.status() != WL_CONNECTED && now - lastWiFiAttemptAt >= WIFI_RETRY_MS) {
    lastWiFiAttemptAt = now;
    WiFi.disconnect();
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  }

  if (pendingButtonPresses > 0) {
    noInterrupts();
    pendingButtonPresses--;
    interrupts();
    sendBonusPress();
    pollDisplay();
  }

  if (now - lastDisplayPollAt >= DISPLAY_POLL_MS) {
    lastDisplayPollAt = now;
    pollDisplay();
  }

  renderPanel();
}
