/*
 * ESP32 Audio Interphone Device
 * 
 * This ESP32 captures audio from a microphone and streams it to the interphone server
 * Configure your WiFi credentials and server IP below
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <driver/i2s.h>
#include <base64.h>

// ===== CONFIGURATION - FILL THESE IN =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";           // Your WiFi network name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // Your WiFi password
const char* SERVER_IP = "192.168.1.100";            // Your server IP address
const int SERVER_PORT = 3001;                       // Your server port
const char* MQTT_SERVER = "192.168.1.100";          // MQTT broker IP (same as server)
const int MQTT_PORT = 1883;                         // MQTT broker port
const char* DEVICE_ID = "interphone_01";            // Main device ID (same for both ESP32s)
// ==========================================

// Audio Configuration
#define I2S_WS 25          // Word Select (LRCLK) pin
#define I2S_SD 32          // Serial Data (DOUT) pin  
#define I2S_SCK 26         // Serial Clock (BCLK) pin
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000
#define I2S_SAMPLE_BITS 16
#define I2S_READ_LEN (1024)
#define AUDIO_BUFFER_SIZE 2048

// Network clients
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HTTPClient httpClient;

// Audio buffer
int16_t audioBuffer[AUDIO_BUFFER_SIZE];
unsigned long lastAudioSend = 0;
const unsigned long AUDIO_SEND_INTERVAL = 100; // Send every 100ms

void setup() {
  Serial.begin(115200);
  Serial.println("\n🎤 ESP32 Audio Interphone Device Starting...");
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize MQTT
  setupMQTT();
  
  // Initialize I2S for audio capture
  setupI2S();
  
  // Register device via MQTT
  registerDevice();
  
  Serial.println("✅ ESP32 Audio Device Ready!");
  Serial.println("🔄 Starting audio streaming...");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Capture and send audio
  if (millis() - lastAudioSend > AUDIO_SEND_INTERVAL) {
    captureAndSendAudio();
    lastAudioSend = millis();
  }
  
  delay(10);
}

void setupWiFi() {
  Serial.print("🔗 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("✅ WiFi connected! IP: ");
  Serial.println(WiFi.localIP());
}

void setupMQTT() {
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void setupI2S() {
  Serial.println("🎧 Initializing I2S for audio capture...");
  
  i2s_config_t i2s_config = {
    .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = i2s_bits_per_sample_t(I2S_SAMPLE_BITS),
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false
  };
  
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  
  esp_err_t result = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (result != ESP_OK) {
    Serial.printf("❌ Failed to install I2S driver: %d\n", result);
    return;
  }
  
  result = i2s_set_pin(I2S_PORT, &pin_config);
  if (result != ESP_OK) {
    Serial.printf("❌ Failed to set I2S pins: %d\n", result);
    return;
  }
  
  Serial.println("✅ I2S initialized successfully");
}

void registerDevice() {
  Serial.println("📝 Registering audio device via MQTT...");
  
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  
  // Create device registration message
  DynamicJsonDocument doc(512);
  doc["id"] = String(DEVICE_ID) + "_audio";
  doc["name"] = String(DEVICE_ID) + " Audio";
  doc["type"] = "interphone_audio";
  doc["status"] = "online";
  doc["capabilities"] = "audio_capture";
  doc["ip"] = WiFi.localIP().toString();
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "devices/" + String(DEVICE_ID) + "_audio/register";
  
  if (mqttClient.publish(topic.c_str(), payload.c_str())) {
    Serial.println("✅ Audio device registered successfully");
  } else {
    Serial.println("❌ Failed to register audio device");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("🔄 Attempting MQTT connection...");
    
    String clientId = String(DEVICE_ID) + "_audio_" + String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" connected!");
      
      // Subscribe to control topics
      String controlTopic = "devices/" + String(DEVICE_ID) + "/control";
      mqttClient.subscribe(controlTopic.c_str());
      
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.printf("📨 MQTT message [%s]: %s\n", topic, message.c_str());
  
  // Handle control commands (e.g., start/stop audio, adjust volume)
  DynamicJsonDocument doc(256);
  deserializeJson(doc, message);
  
  if (doc["command"] == "start_audio") {
    Serial.println("🎤 Starting audio capture");
  } else if (doc["command"] == "stop_audio") {
    Serial.println("🔇 Stopping audio capture");
  }
}

void captureAndSendAudio() {
  size_t bytesRead = 0;
  
  // Read audio data from I2S
  esp_err_t result = i2s_read(I2S_PORT, audioBuffer, I2S_READ_LEN * sizeof(int16_t), &bytesRead, portMAX_DELAY);
  
  if (result != ESP_OK) {
    Serial.printf("❌ I2S read failed: %d\n", result);
    return;
  }
  
  if (bytesRead == 0) {
    return;
  }
  
  // Convert audio data to base64
  String audioBase64 = base64::encode((uint8_t*)audioBuffer, bytesRead);
  
  // Create JSON payload
  DynamicJsonDocument doc(4096);
  doc["deviceId"] = DEVICE_ID;              // Use main device ID
  doc["streamType"] = "audio";              // Mark as audio stream
  doc["timestamp"] = millis();
  doc["audioData"] = audioBase64;
  doc["sampleRate"] = I2S_SAMPLE_RATE;
  doc["channels"] = 1;
  doc["samples"] = bytesRead / sizeof(int16_t);
  doc["format"] = "pcm_s16le";
  
  String payload;
  serializeJson(doc, payload);
  
  // Send HTTP POST to server
  sendAudioToServer(payload);
}

void sendAudioToServer(String payload) {
  httpClient.begin(String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/stream/audio");
  httpClient.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = httpClient.POST(payload);
  
  if (httpResponseCode == 200) {
    Serial.println("🎤 ✅ Audio sent successfully");
  } else {
    Serial.printf("🎤 ❌ HTTP Error: %d\n", httpResponseCode);
  }
  
  httpClient.end();
}
