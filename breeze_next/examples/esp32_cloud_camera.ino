#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_camera.h>
#include <base64.h>
#include <ArduinoJson.h>

// ===== CONFIGURATION - FILL THESE IN =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER = "broker.hivemq.com";  // Free public MQTT broker
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "esp32cam_";       // Will be appended with device MAC
const char* MQTT_TOPIC = "breeze/cameras/";     // Will be appended with device ID
const char* DEVICE_ID = "esp32cam_01";          // Unique device ID
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

// Video capture settings
unsigned long lastFrameTime = 0;
const unsigned long FRAME_INTERVAL = 200;  // Send every 200ms (5 FPS)
int frameCount = 0;
int videoQuality = 12;                     // JPEG compression quality (0-63, lower is better)
framesize_t frameSize = FRAMESIZE_VGA;     // 640x480

// Status LED
const int LED_PIN = 33;  // Built-in LED on most ESP32-CAM boards

void setup() {
  Serial.begin(115200);
  Serial.println("\n📹 ESP32 Cloud Camera Starting...");

  // Initialize status LED
  pinMode(LED_PIN, OUTPUT);
  flashLED(3); // Flash LED 3 times on startup
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize MQTT
  setupMQTT();
  
  // Initialize Camera
  setupCamera();
  
  // Register device via MQTT
  registerDevice();
  
  Serial.println("✅ ESP32 Cloud Camera Ready!");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Capture and send video frame
  if (millis() - lastFrameTime > FRAME_INTERVAL) {
    captureAndSendFrame();
    lastFrameTime = millis();
  }
}

void flashLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
}

void setupWiFi() {
  Serial.print("🔗 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Flash LED while connecting
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("✅ WiFi connected! IP: ");
  Serial.println(WiFi.localIP());
}

void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(16384); // Increase buffer size for larger payloads
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
    config.frame_size = frameSize;
    config.jpeg_quality = videoQuality;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }
  
  // Initialize camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    flashLED(5); // Flash LED 5 times to indicate error
    delay(1000);
    ESP.restart();
    return;
  }
  
  // Optimize camera settings
  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, 1);        // -2 to 2
    s->set_contrast(s, 0);          // -2 to 2
    s->set_saturation(s, 0);        // -2 to 2
    s->set_whitebal(s, 1);          // 0 = disable, 1 = enable
    s->set_awb_gain(s, 1);          // 0 = disable, 1 = enable
    s->set_exposure_ctrl(s, 1);     // 0 = disable, 1 = enable
    s->set_gain_ctrl(s, 1);         // 0 = disable, 1 = enable
    s->set_hmirror(s, 0);           // 0 = disable, 1 = enable
    s->set_vflip(s, 0);             // 0 = disable, 1 = enable
  }
  
  Serial.println("✅ Camera initialized successfully");
}

void registerDevice() {
  Serial.println("📝 Registering device via MQTT...");
  
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  
  // Create device registration message
  DynamicJsonDocument doc(512);
  doc["id"] = DEVICE_ID;
  doc["name"] = "ESP32 Cloud Camera";
  doc["type"] = "camera";
  doc["status"] = "online";
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["timestamp"] = millis();
  doc["capabilities"] = "video";
  doc["width"] = 640;
  doc["height"] = 480;
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "breeze/devices/" + String(DEVICE_ID) + "/discovery";
  
  if (mqttClient.publish(topic.c_str(), payload.c_str())) {
    Serial.println("✅ Device registered successfully");
    flashLED(2);
  } else {
    Serial.println("❌ Failed to register device");
  }
}

void reconnectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 3) {
    Serial.print("🔄 Attempting MQTT connection...");
    
    // Create a unique client ID using device ID and MAC address
    String clientId = MQTT_CLIENT_ID;
    clientId += WiFi.macAddress();
    clientId.replace(":", "");
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" connected!");
      flashLED(1);
      
      // Subscribe to control topic
      String controlTopic = "breeze/devices/" + String(DEVICE_ID) + "/control";
      mqttClient.subscribe(controlTopic.c_str());
      
      // Send an online status message
      String statusTopic = "breeze/devices/" + String(DEVICE_ID) + "/status";
      mqttClient.publish(statusTopic.c_str(), "{\"status\":\"online\"}");
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds");
      flashLED(4); // Flash 4 times to indicate connection failure
      delay(5000);
      attempts++;
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.printf("📨 MQTT message [%s]: %s\n", topic, message.c_str());
  
  // Parse JSON command
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.print("❌ JSON parsing failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Handle control commands
  if (doc.containsKey("command")) {
    String command = doc["command"].as<String>();
    
    if (command == "restart") {
      Serial.println("🔄 Restarting device...");
      ESP.restart();
    } 
    else if (command == "quality" && doc.containsKey("value")) {
      videoQuality = doc["value"].as<int>();
      Serial.printf("📷 Setting quality to %d\n", videoQuality);
      sensor_t * s = esp_camera_sensor_get();
      if (s) s->set_quality(s, videoQuality);
    }
    else if (command == "framesize" && doc.containsKey("value")) {
      int size = doc["value"].as<int>();
      Serial.printf("📷 Setting frame size to %d\n", size);
      sensor_t * s = esp_camera_sensor_get();
      if (s) s->set_framesize(s, (framesize_t)size);
    }
    else if (command == "framerate" && doc.containsKey("value")) {
      int interval = 1000 / doc["value"].as<int>();
      FRAME_INTERVAL = max(100, interval); // Minimum 100ms (10fps)
      Serial.printf("📷 Setting frame interval to %d ms\n", FRAME_INTERVAL);
    }
  }
}

void captureAndSendFrame() {
  digitalWrite(LED_PIN, HIGH); // Turn on LED while capturing
  
  // Capture image from camera
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("❌ Camera capture failed");
    digitalWrite(LED_PIN, LOW);
    return;
  }
  
  // Check if it's time to send a full quality frame (every 5 frames)
  bool isKeyFrame = (frameCount % 5 == 0);
  
  // Compress image further for non-key frames
  if (!isKeyFrame && fb->len > 5000) {
    // For non-key frames, use higher compression temporarily
    sensor_t * s = esp_camera_sensor_get();
    if (s) {
      int originalQuality = s->status.quality;
      s->set_quality(s, min(25, originalQuality + 10)); // Lower quality for intermediate frames
      
      // Release current frame
      esp_camera_fb_return(fb);
      
      // Capture again with lower quality
      fb = esp_camera_fb_get();
      
      // Restore original quality
      s->set_quality(s, originalQuality);
      
      if (!fb) {
        Serial.println("❌ Camera recapture failed");
        digitalWrite(LED_PIN, LOW);
        return;
      }
    }
  }
  
  // Only send frame if MQTT is connected
  if (mqttClient.connected()) {
    // Create base64 encoded image
    String base64Image = base64::encode(fb->buf, fb->len);
    
    // Prepare JSON payload with minimal metadata
    DynamicJsonDocument doc(base64Image.length() + 256);
    doc["deviceId"] = DEVICE_ID;
    doc["timestamp"] = millis();
    doc["type"] = "video";
    doc["keyFrame"] = isKeyFrame;
    doc["data"] = base64Image;
    
    if (isKeyFrame) {
      // Only include metadata in key frames
      doc["metadata"]["width"] = fb->width;
      doc["metadata"]["height"] = fb->height;
      doc["metadata"]["format"] = "jpeg";
    }
    
    // Serialize JSON
    String payload;
    serializeJson(doc, payload);
    
    // Publish frame to MQTT topic
    String topic = "breeze/devices/" + String(DEVICE_ID) + "/streams/video";
    
    bool success = mqttClient.publish(topic.c_str(), payload.c_str());
    if (success) {
      Serial.print("📤 Frame sent: ");
      Serial.print(fb->len);
      Serial.print(" bytes, Base64: ");
      Serial.println(base64Image.length());
      frameCount++;
    } else {
      Serial.println("❌ Failed to publish frame");
    }
  } else {
    Serial.println("📴 MQTT disconnected, skipping frame");
  }
  
  // Release the frame buffer
  esp_camera_fb_return(fb);
  
  digitalWrite(LED_PIN, LOW); // Turn off LED
}
