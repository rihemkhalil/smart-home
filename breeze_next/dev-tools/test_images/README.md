# Test Images for Camera Stream Simulator

Place JPEG or PNG test images in this folder to use with the camera stream simulator.

The test script (`test_camera_stream.js`) will use these images to simulate an ESP32 camera sending frames to your application.

## Usage

1. Add several JPEG or PNG images to this folder
2. Run the simulator script: `node test_camera_stream.js`
3. The script will cycle through these images, sending them as video frames

## Tips

- Use images of consistent dimensions (e.g., 640x480) for best results
- Smaller images will transmit faster and use less bandwidth
- 5-10 test images are usually sufficient for testing
