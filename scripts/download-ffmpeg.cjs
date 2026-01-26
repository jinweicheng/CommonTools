#!/usr/bin/env node

/**
 * FFmpeg WASM 文件下载脚本
 * 
 * 功能：
 * - 自动下载 FFmpeg WASM 核心文件到 public 目录
 * - 显示下载进度
 * - 验证文件完整性
 * 
 * 使用：
 * node scripts/download-ffmpeg.cjs
 * 或
 * npm run download-ffmpeg
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const VERSION = '0.12.10';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/umd/`;

const files = [
  { 
    name: 'ffmpeg-core.js', 
    expectedSize: 1.5 * 1024 * 1024, // ~1.5MB
    description: 'JavaScript core'
  },
  { 
    name: 'ffmpeg-core.wasm', 
    expectedSize: 32 * 1024 * 1024, // ~32MB
    description: 'WebAssembly core'
  }
];

const publicDir = path.join(__dirname, '..', 'public');

// 确保 public 目录存在
if (!fs.existsSync(publicDir)) {
  console.error('❌ Error: public directory not found');
  console.error('   Please run this script from the project root directory');
  process.exit(1);
}

console.log('📦 FFmpeg WASM Downloader');
console.log(`📌 Version: ${VERSION}`);
console.log(`📁 Destination: ${publicDir}`);
console.log('');

// 格式化文件大小
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// 下载单个文件
function downloadFile(fileInfo) {
  return new Promise((resolve, reject) => {
    const { name, expectedSize, description } = fileInfo;
    const url = BASE_URL + name;
    const dest = path.join(publicDir, name);

    console.log(`⬇️  Downloading ${name} (${description})...`);
    console.log(`   URL: ${url}`);

    const file = fs.createWriteStream(dest);
    let downloadedSize = 0;
    const startTime = Date.now();

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = totalSize > 0 ? ((downloadedSize / totalSize) * 100).toFixed(1) : '?';
        const speed = downloadedSize / ((Date.now() - startTime) / 1000) / 1024; // KB/s
        
        // 更新进度（每 5% 或最后）
        if (totalSize > 0 && (downloadedSize === totalSize || downloadedSize % (totalSize / 20) < 1024)) {
          process.stdout.write(`\r   Progress: ${percent}% (${formatBytes(downloadedSize)}/${formatBytes(totalSize)}) @ ${speed.toFixed(0)} KB/s`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(''); // 新行
        
        // 验证文件大小
        const actualSize = fs.statSync(dest).size;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (Math.abs(actualSize - expectedSize) > expectedSize * 0.2) {
          console.warn(`⚠️  Warning: File size mismatch for ${name}`);
          console.warn(`   Expected: ~${formatBytes(expectedSize)}, Got: ${formatBytes(actualSize)}`);
        }
        
        console.log(`✅ ${name} downloaded successfully`);
        console.log(`   Size: ${formatBytes(actualSize)}`);
        console.log(`   Time: ${elapsed}s`);
        console.log('');
        
        resolve({ name, size: actualSize, time: elapsed });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// 主函数
async function main() {
  const results = [];
  const startTime = Date.now();

  for (const fileInfo of files) {
    try {
      const result = await downloadFile(fileInfo);
      results.push(result);
    } catch (err) {
      console.error(`❌ Failed to download ${fileInfo.name}:`, err.message);
      console.error('');
      console.error('Troubleshooting:');
      console.error('1. Check your internet connection');
      console.error('2. Try again later (CDN might be temporarily unavailable)');
      console.error('3. Download manually from:');
      console.error(`   ${BASE_URL}${fileInfo.name}`);
      process.exit(1);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalSize = results.reduce((sum, r) => sum + r.size, 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ All files downloaded successfully!');
  console.log(`📊 Total size: ${formatBytes(totalSize)}`);
  console.log(`⏱️  Total time: ${totalTime}s`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Restart your development server (npm run dev)');
  console.log('2. Test Live Photo conversion');
  console.log('3. Check console for "Loading from Local" messages');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// 运行
main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
