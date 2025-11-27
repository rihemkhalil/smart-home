#!/usr/bin/env node

/**
 * Clean Start Script for Unified Interphone Emulator
 * Ensures only one unified device is running
 */

const { exec, spawn } = require('child_process');
const path = require('path');

console.log('🧹 Cleaning up any running emulators...');

// Kill any existing node processes running emulators
exec('pkill -f "esp32.*emulator"', (error) => {
  if (error && error.code !== 1) {
    console.log('Note: No existing emulators found to clean up');
  } else {
    console.log('✅ Cleaned up existing emulators');
  }
  
  // Wait a moment then start the unified emulator
  setTimeout(startUnifiedEmulator, 2000);
});

function startUnifiedEmulator() {
  console.log('🚀 Starting ONLY the unified interphone emulator...\n');
  
  const emulator = spawn('node', [path.join(__dirname, 'esp32_unified_interphone_emulator.js')], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  emulator.on('close', (code) => {
    console.log(`\n✅ Unified emulator exited with code ${code}`);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping unified emulator...');
    emulator.kill('SIGINT');
    
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
}

console.log('📞 Clean Unified Interphone Emulator');
console.log('   This ensures only ONE device appears in the dashboard');
console.log('   Device: "Interphone Device (Audio + Video)"');
console.log('   Capabilities: Full audio + video streaming');
console.log('');
