/*
 * ESP32 Video Interphone Device
 * 
 * This ESP32 captures video from a camera and streams it to the interphone server
 * Configure your WiFi credentials and server IP below
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <esp_camera.h>
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

// Camera Configuration (ESP32-CAM)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// Network clients
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HTTPClient httpClient;

// Video capture settings
unsigned long lastVideoSend = 0;
const unsigned long VIDEO_SEND_INTERVAL = 200; // Send every 200ms (5 FPS)

void setup() {
  Serial.begin(115200);
  Serial.println("\n📹 ESP32 Video Interphone Device Starting...");
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize MQTT
  setupMQTT();
  
  // Initialize Camera
  setupCamera();
  
  // Register device via MQTT
  registerDevice();
  
  Serial.println("✅ ESP32 Video Device Ready!");
  Serial.println("🔄 Starting video streaming...");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Capture and send video
  if (millis() - lastVideoSend > VIDEO_SEND_INTERVAL) {
    captureAndSendVideo();
    lastVideoSend = millis();
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

void setupCamera() {
  Serial.println("📷 Initializing camera...");
  
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Frame size and quality settings
  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA;    // 640x480
    config.jpeg_quality = 12;             // Higher quality
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_CIF;    // 352x288
    config.jpeg_quality = 15;             // Lower quality for memory
    config.fb_count = 1;
  }
  
  // Initialize camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    return;
  }
  
  // Additional camera settings
  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, 0);     // -2 to 2
    s->set_contrast(s, 0);       // -2 to 2
    s->set_saturation(s, 0);     // -2 to 2
    s->set_special_effect(s, 0); // 0 to 6 (0-No Effect, 1-Negative, 2-Grayscale, 3-Red Tint, 4-Green Tint, 5-Blue Tint, 6-Sepia)
    s->set_whitebal(s, 1);       // 0 = disable , 1 = enable
    s->set_awb_gain(s, 1);       // 0 = disable , 1 = enable
    s->set_wb_mode(s, 0);        // 0 to 4 - if awb_gain enabled (0 - Auto, 1 - Sunny, 2 - Cloudy, 3 - Office, 4 - Home)
    s->set_exposure_ctrl(s, 1);  // 0 = disable , 1 = enable
    s->set_aec2(s, 0);           // 0 = disable , 1 = enable
    s->set_ae_level(s, 0);       // -2 to 2
    s->set_aec_value(s, 300);    // 0 to 1200
    s->set_gain_ctrl(s, 1);      // 0 = disable , 1 = enable
    s->set_agc_gain(s, 0);       // 0 to 30
    s->set_gainceiling(s, (gainceiling_t)0);  // 0 to 6
    s->set_bpc(s, 0);            // 0 = disable , 1 = enable
    s->set_wpc(s, 1);            // 0 = disable , 1 = enable
    s->set_raw_gma(s, 1);        // 0 = disable , 1 = enable
    s->set_lenc(s, 1);           // 0 = disable , 1 = enable
    s->set_hmirror(s, 0);        // 0 = disable , 1 = enable
    s->set_vflip(s, 0);          // 0 = disable , 1 = enable
    s->set_dcw(s, 1);            // 0 = disable , 1 = enable
    s->set_colorbar(s, 0);       // 0 = disable , 1 = enable
  }
  
  Serial.println("✅ Camera initialized successfully");
}

void registerDevice() {
  Serial.println("📝 Registering video device via MQTT...");
  
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  
  // Create device registration message
  DynamicJsonDocument doc(512);
  doc["id"] = String(DEVICE_ID) + "_video";
  doc["name"] = String(DEVICE_ID) + " Video";
  doc["type"] = "interphone_video";
  doc["status"] = "online";
  doc["capabilities"] = "video_capture";
  doc["ip"] = WiFi.localIP().toString();
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "devices/" + String(DEVICE_ID) + "_video/register";
  
  if (mqttClient.publish(topic.c_str(), payload.c_str())) {
    Serial.println("✅ Video device registered successfully");
  } else {
    Serial.println("❌ Failed to register video device");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("🔄 Attempting MQTT connection...");
    
    String clientId = String(DEVICE_ID) + "_video_" + String(random(0xffff), HEX);
    
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
  
  // Handle control commands (e.g., start/stop video, adjust quality)
  DynamicJsonDocument doc(256);
  deserializeJson(doc, message);
  
  if (doc["command"] == "start_video") {
    Serial.println("📹 Starting video capture");
  } else if (doc["command"] == "stop_video") {
    Serial.println("📹 Stopping video capture");
  } else if (doc["command"] == "set_quality") {
    int quality = doc["quality"];
    Serial.printf("📹 Setting video quality: %d\n", quality);
    sensor_t * s = esp_camera_sensor_get();
    if (s != NULL) {
      s->set_quality(s, quality);
    }
  }
}

void captureAndSendVideo() {
  // Capture image from camera
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("❌ Camera capture failed");
    return;
  }
  
  // Convert image to base64
  String imageBase64 = base64::encode(fb->buf, fb->len);
  
  // Create JSON payload
  DynamicJsonDocument doc(imageBase64.length() + 512);
  doc["deviceId"] = DEVICE_ID;              // Use main device ID
  doc["streamType"] = "video";              // Mark as video stream
  doc["timestamp"] = millis();
  doc["videoData"] = imageBase64;
  doc["width"] = fb->width;
  doc["height"] = fb->height;
  doc["format"] = "jpeg";
  doc["frameRate"] = 5;
  
  String payload;
  serializeJson(doc, payload);
  
  // Release the frame buffer
  esp_camera_fb_return(fb);
  
  // Send HTTP POST to server
  sendVideoToServer(payload);
}

void sendVideoToServer(String payload) {
  httpClient.begin(String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/stream/video");
  httpClient.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = httpClient.POST(payload);
  
  if (httpResponseCode == 200) {
    Serial.println("📹 ✅ Video sent successfully");
  } else {
    Serial.printf("📹 ❌ HTTP Error: %d\n", httpResponseCode);
  }
  
  httpClient.end();
}
