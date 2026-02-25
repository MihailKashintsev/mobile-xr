#!/usr/bin/env node
// generate-assets.js - Creates placeholder icon/splash assets
// Run: node scripts/generate-assets.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function createIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, '#1a1a3e');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  // XR text
  ctx.fillStyle = '#6c63ff';
  ctx.font = `bold ${size * 0.4}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('XR', size/2, size/2);
  
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Created: ${outputPath}`);
}

// Create assets directory
fs.mkdirSync('assets', { recursive: true });

createIcon(1024, 'assets/icon.png');
createIcon(1024, 'assets/adaptive-icon.png');
createIcon(2048, 'assets/splash.png');

console.log('✓ Assets generated');
