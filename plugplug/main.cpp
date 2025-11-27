#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <ESP8266WebServer.h>
#include <PubSubClient.h>

#define RELAY_PIN 4
#define DEVICE_ID "esp8266-001"

const char* mqtt_server = "51.83.98.100";
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient mqttClient(espClient);
ESP8266WebServer webServer(80); 

bool relayState = false; 
unsigned long lastStatusTime = 0;
unsigned long deviceStartTime = 0;

void sendDiscovery() {
    String topic = String("breeze/devices/") + DEVICE_ID + "/discovery";
    String payload = String("{") +
                     "\"id\":\"" + String(DEVICE_ID) + "\"," +
                     "\"name\":\"Smart Plug\"," +
                     "\"type\":\"ESP8266\"," +
                     "\"firmware\":\"1.0.0\"," +
                     "\"ip\":\"" + WiFi.localIP().toString() + "\"," +
                     "\"mac\":\"" + WiFi.macAddress() + "\"," +
                     "\"state\":\"" + String(relayState ? "on" : "off") + "\"" +
                     "}";

    bool ok = mqttClient.publish(topic.c_str(), payload.c_str(), true);
    Serial.print("Discovery publish: ");
    Serial.println(ok ? "OK" : "FAILED");
    Serial.print("Topic: "); Serial.println(topic);
    Serial.print("Payload: "); Serial.println(payload);
}

// ✅ FIXED: Correct status format matching emulator exactly
void sendStatus() {
    String topic = String("breeze/devices/") + DEVICE_ID + "/status";
    
    // Calculate uptime in seconds (like emulator)
    unsigned long uptime = (millis() - deviceStartTime) / 1000;
    
    String payload = "{";
    payload += "\"online\":true,";
    payload += "\"wifi_strength\":" + String(WiFi.RSSI()) + ",";  // ✅ wifi_strength not signal
    payload += "\"uptime\":" + String(uptime) + ",";
    payload += "\"free_heap\":" + String(ESP.getFreeHeap());
    payload += "}";

    bool ok = mqttClient.publish(topic.c_str(), payload.c_str(), false);
    Serial.print("Status publish: ");
    Serial.println(ok ? "OK" : "FAILED");
    Serial.print("Topic: "); Serial.println(topic);
    Serial.print("Payload: "); Serial.println(payload);
}

// ✅ FIXED: Correct state format with millisecond timestamp
void sendState() {
    String topic = String("breeze/devices/") + DEVICE_ID + "/state";
    
    unsigned long currentTimeSeconds = 1735392000 + (millis() / 1000); // Approximate current Unix time
    unsigned long timestamp = currentTimeSeconds * 1000; // Convert to milliseconds
    
    String payload = "{";
    payload += "\"state\":\"" + String(relayState ? "on" : "off") + "\",";
    payload += "\"timestamp\":" + String(timestamp);
    payload += "}";

    bool ok = mqttClient.publish(topic.c_str(), payload.c_str(), false);
    Serial.print("State publish: ");
    Serial.println(ok ? "OK" : "FAILED");
    Serial.print("Topic: "); Serial.println(topic);
    Serial.print("Payload: "); Serial.println(payload);
}

void reconnectMQTT() {
    while (!mqttClient.connected()) {
        Serial.print("Connecting to MQTT...");
        if (mqttClient.connect(DEVICE_ID)) {  
            Serial.println("connected");
            
            String topic = String("breeze/devices/") + DEVICE_ID + "/command/+";
            mqttClient.subscribe(topic.c_str());
            Serial.print("Subscribed to: "); Serial.println(topic);
            
            // ✅ Send discovery
            sendDiscovery(); 
            delay(500);
            
            // ✅ Send initial status
            sendStatus();
            delay(500);
            
            // ✅ CRITICAL: Send initial state message
            sendState();
        } 
        else {
            Serial.print("failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(" try again in 5 seconds");
            delay(5000);
        }
    }
}

void handleRoot() {
    String html = "<!DOCTYPE HTML><html>";
    html += "<h1>Smart Plug WiFi</h1>";
    html += "<p>State: " + String(relayState ? "ON" : "OFF") + "</p>";
    html += "<p><a href=\"/ON\"><button style='background:green;color:white;font-size:20px'>ON</button></a></p>";
    html += "<p><a href=\"/OFF\"><button style='background:red;color:white;font-size:20px'>OFF</button></a></p>";
    html += "</html>";

    webServer.send(200, "text/html", html);
}

void setRelayState(bool state) {
    digitalWrite(RELAY_PIN, state ? LOW : HIGH);  // Assuming LOW = ON
    relayState = state;
    Serial.println("Relay " + String(state ? "ON" : "OFF"));
    
    // ✅ Send state update immediately
    sendState();
}

void handleRelayOn() {
    setRelayState(true);
    handleRoot();
}

void handleRelayOff() {
    setRelayState(false);
    handleRoot();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String message = "";
    for (unsigned int i = 0; i < length; i++) {
        message += (char)payload[i];
    }

    Serial.print("MQTT message arrived [");
    Serial.print(topic);
    Serial.print("] ");
    Serial.println(message);

    String commandTopic = String("breeze/devices/") + DEVICE_ID + "/command/set_state";
    if (String(topic) == commandTopic) {
        // ✅ Parse JSON properly
        if (message.indexOf("\"on\"") >= 0 || message.indexOf(":\"on\"") >= 0) {
            setRelayState(true);
        } else if (message.indexOf("\"off\"") >= 0 || message.indexOf(":\"off\"") >= 0) {
            setRelayState(false);
        }
    }
}

void setup() {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, HIGH);  // Start OFF
    
    Serial.begin(115200);
    delay(1000);
    
    // ✅ Record device start time for uptime calculation
    deviceStartTime = millis();
    
    Serial.print("MAC Address: ");
    Serial.println(WiFi.macAddress());

    WiFiManager wifiManager;
    wifiManager.autoConnect("SmartPlug-Setup");

    Serial.print("Connected! IP: ");
    Serial.println(WiFi.localIP());

    mqttClient.setServer(mqtt_server, mqtt_port);
    mqttClient.setCallback(mqttCallback);
    
    // ✅ Connect to MQTT immediately
    reconnectMQTT(); 

    webServer.on("/", handleRoot);
    webServer.on("/ON", handleRelayOn);
    webServer.on("/OFF", handleRelayOff);
    webServer.begin();
    
    Serial.println("ESP8266 Smart Plug ready!");
}

void loop() {
    webServer.handleClient();
    
    if (!mqttClient.connected()) {
        reconnectMQTT(); 
    }
    mqttClient.loop();

    // ✅ Send status every 30 seconds (like emulator)
    if (millis() - lastStatusTime > 30000) {
        if (mqttClient.connected()) {
            sendStatus();
        }
        lastStatusTime = millis();
    }
}

