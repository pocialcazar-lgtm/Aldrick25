const cluster = require('cluster');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const app = express();

const ports = [4000, 3000, 5000, 8000, 8080, 4444];
let availablePortIndex = 0;

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', reject);
  });
}

function printBanner() {
  const banner = `
\x1b[34m╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   ██    ██  █████  ██      ███████ ███    ██  █████                  ║
║   ██    ██ ██   ██ ██      ██      ████   ██ ██   ██                 ║
║   ██    ██ ███████ ██      █████   ██ ██  ██ ███████                 ║
║    ██  ██  ██   ██ ██      ██      ██  ██ ██ ██   ██                 ║
║     ████   ██   ██ ███████ ███████ ██   ████ ██   ██                 ║
║                                                                      ║
║       🤖 VALENA - AI | BOT WHATSAPP MULTIDEVICE AI           ║
╚══════════════════════════════════════════════════════════════════════╝\x1b[0m`;

  const rules = `
\x1b[33m═════════════════════[ 🔒 RULES SCRIPT ]═════════════════════
🚫 Script ini tidak boleh diperjual belikan!
🛠️  Hanya untuk penggunaan pribadi dan edukasi.
📌 Jangan hapus watermark jika bukan developer asli.
📝 Watermark: Xz Team Community
════════════════════════════════════════════════════════════════\x1b[0m`;

  const devInfo = `
\x1b[36m═════════════════════[ 👤 DEVELOPER INFO ]════════════════════
📱 Developer       : Luccane
📞 WhatsApp        : wa.me/6283198520706
📷 Instagram       : instagram.com/luccanexz_store
💬 Channel WhatsApp: https://chat.whatsapp.com/HM4hlpWZoX2G5rQ9USYlzi
════════════════════════════════════════════════════════════════\x1b[0m`;

  console.log(banner);
  console.log(rules);
  console.log(devInfo);
}

async function startServer() {
  const port = ports[availablePortIndex];
  const isPortAvailable = await checkPort(port);

  if (isPortAvailable) {
    console.clear();
    printBanner();
    console.log(`\n🌐 \x1b[32mServer running on port ${port}\x1b[0m\n`);

    app.get('/', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const data = {
        status: 'true',
        message: 'Bot Successfully Activated!',
        author: 'Luccane'
      };
      res.send(JSON.stringify({ response: data }, null, 2));
    });

  } else {
    console.log(`\x1b[31mPort ${port} is already in use. Trying another...\x1b[0m`);
    availablePortIndex++;
    if (availablePortIndex >= ports.length) {
      console.error('\x1b[31mNo more available ports. Exiting...\x1b[0m');
      process.exit(1);
    } else {
      ports[availablePortIndex] = parseInt(port) + 1;
      startServer();
    }
  }
}

startServer();

let isRunning = false;

function start(file) {
  if (isRunning) return;
  isRunning = true;

  const args = [path.join(__dirname, file), ...process.argv.slice(2)];
  const p = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  });

  p.on('message', (data) => {
    console.log('\x1b[36m🟢 RECEIVED:\x1b[0m', data);
    if (data === 'reset') {
      p.kill();
      isRunning = false;
      start.apply(this, arguments);
    }
  });

  p.on('exit', (code) => {
    isRunning = false;
    console.error(`\x1b[31m❌ Bot exited with code ${code}\x1b[0m`);
    start('main.js');
  });

  p.on('error', (err) => {
    console.error('\x1b[31m❌ Error occurred:\x1b[0m', err);
    p.kill();
    isRunning = false;
    start('main.js');
  });

  const pluginsFolder = path.join(__dirname, 'plugins');
  fs.readdir(pluginsFolder, (err, files) => {
    if (err) {
      console.error('\x1b[31m❌ Error reading plugins folder:\x1b[0m', err);
      return;
    }
    console.log(`🧩 \x1b[33m${files.length} plugin(s) loaded from "${pluginsFolder}"\x1b[0m`);

    try {
      const version = require('@adiwajshing/baileys/package.json').version;
      console.log(`📦 \x1b[32mBaileys v${version} loaded\x1b[0m`);
    } catch (e) {
      console.error('\x1b[31m❌ Baileys not found. Run "npm i @adiwajshing/baileys"\x1b[0m');
    }
  });

  console.log(`💻 \x1b[36mOS:\x1b[0m ${os.type()} ${os.release()} (${os.arch()})`);
  const total = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const free = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  console.log(`💾 \x1b[36mTotal RAM:\x1b[0m ${total} GB`);
  console.log(`📉 \x1b[36mFree RAM:\x1b[0m ${free} GB`);
  console.log(`🔗 \x1b[34mGroup:\x1b[0m https://chat.whatsapp.com/HM4hlpWZoX2G5rQ9USYlzi`);

  setInterval(() => {}, 1000);
}

start('main.js');

const tmpDir = './tmp';
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
  console.log('\x1b[33m📁 Created directory:\x1b[0m tmp/');
}

process.on('unhandledRejection', (reason) => {
  console.error('\x1b[31m💥 Unhandled Promise Rejection:\x1b[0m', reason);
  start('main.js');
});

process.on('exit', (code) => {
  console.error(`\x1b[31m🚪 Process exited with code ${code}. Restarting...\x1b[0m`);
  start('main.js');
});