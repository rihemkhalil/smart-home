#include <WiFi.h>
#include <WebServer.h>
#include "driver/i2s.h"


const char* ssid = "ssid";
const char* password = "password";


#define I2S_WS 25  
#define I2S_SCK 26 
#define I2S_SD 22  
#define SAMPLE_RATE 16000
#define I2S_PORT I2S_NUM_0
#define DMA_BUF_LEN 256
#define DMA_BUF_COUNT 4


WebServer server(80);
WiFiClient audioClient;   
bool streaming = false;   

// --- WAV Header struct ---
struct WAVHeader {
  char chunkId[4];
  uint32_t chunkSize;
  char format[4];
  char subchunk1Id[4];
  uint32_t subchunk1Size;
  uint16_t audioFormat;
  uint16_t numChannels;
  uint32_t sampleRate;
  uint32_t byteRate;
  uint16_t blockAlign;
  uint16_t bitsPerSample;
  char subchunk2Id[4];
  uint32_t subchunk2Size;
};

void initI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = DMA_BUF_COUNT,
    .dma_buf_len = DMA_BUF_LEN,
    .use_apll = false
  };
  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  i2s_set_pin(I2S_PORT, &pin_config);
}

void handleAudio() {
  if (streaming) {
    server.send(503, "text/plain", "Already streaming");
    return;
  }

  audioClient = server.client();
  streaming = true;

  // Prepare header WAV
  WAVHeader header;
  memcpy(header.chunkId, "RIFF", 4);
  header.chunkSize = 0; // streaming
  memcpy(header.format, "WAVE", 4);
  memcpy(header.subchunk1Id, "fmt ", 4);
  header.subchunk1Size = 16;
  header.audioFormat = 1;
  header.numChannels = 1;
  header.sampleRate = SAMPLE_RATE;
  header.bitsPerSample = 16;
  header.byteRate = SAMPLE_RATE * header.numChannels * header.bitsPerSample / 8;
  header.blockAlign = header.numChannels * header.bitsPerSample / 8;
  memcpy(header.subchunk2Id, "data", 4);
  header.subchunk2Size = 0; // streaming

  audioClient.print("HTTP/1.1 200 OK\r\n");
  audioClient.print("Content-Type: audio/wav\r\n");
  audioClient.print("Connection: close\r\n\r\n");
  audioClient.write((uint8_t*)&header, sizeof(header));

  Serial.println("Audio stream started!");
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  Serial.print("Connexion WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connecté ! IP ESP32: ");
  Serial.println(WiFi.localIP());

  initI2S();

  server.on("/audio", HTTP_GET, handleAudio);
  server.begin();
  Serial.println("Serveur HTTP démarré. URL: http://" + WiFi.localIP().toString() + "/audio");
}

void loop() {
  server.handleClient();

  if (streaming && audioClient.connected()) {
    int16_t buffer[DMA_BUF_LEN];
    size_t bytesRead;
    i2s_read(I2S_PORT, buffer, sizeof(buffer), &bytesRead, portMAX_DELAY);
    if (bytesRead > 0) {
      audioClient.write((uint8_t*)buffer, bytesRead);
    }
  } else if (streaming) {
    Serial.println("Client disconnected, stopping stream.");
    streaming = false;
  }
}
