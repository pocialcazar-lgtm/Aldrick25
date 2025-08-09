(async () => {
  // setting
  require("./config");

  const {
    useMultiFileAuthState,
    DisconnectReason,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    jidDecode,
    fetchLatestBaileysVersion,
    proto,
    Browsers
  } = require("@adiwajshing/baileys");

  // module nya
  const NodeCache = require("node-cache");
  const pino = require("pino");
  const chokidar = require("chokidar");
  const WebSocket = require("ws");
  const path = require("path");
  const { join } = require("path");
  const { format } = require("util");
  const fs = require("fs");
  const os = require("os");
  const yargs = require("yargs/yargs");
  const { spawn } = require("child_process");
  const _ = require("lodash");
  const syntaxError = require("syntax-error");
  const chalk = require("chalk");
  let simple = require("./lib/simple");

  var LowDB;
  try {
    LowDB = require("lowdb");
  } catch (e) {
    LowDB = require("./lib/lowdb");
  }
  const { Low, JSONFile } = LowDB;
  const mongoDB = require("./lib/mongoDB");

  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const question = (text) => new Promise(resolve => rl.question(text, resolve));

  global.API = (apiName, apiPath = "/", query = {}, apiKeyParam) =>
    (apiName in global.APIs ? global.APIs[apiName] : apiName) +
    apiPath +
    (query || apiKeyParam ? "?" + new URLSearchParams(
      Object.entries({
        ...query,
        ...(apiKeyParam ? { [apiKeyParam]: global.APIKeys[apiName in global.APIs ? global.APIs[apiName] : apiName] } : {})
      })
    ) : '');
    
  global.timestamp = { start: new Date() };

  global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());

  global.prefix = new RegExp("^[" + (opts.prefix || "‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-").replace(/[|\\{}()[\]^$+*?.\-\^]/g, "\\$&") + "]");

  global.db = new Low(
    /https?:\/\//.test(opts.db || '') ? new cloudDBAdapter(opts.db) :
    /mongodb/.test(opts.db) ? new mongoDB(opts.db) :
    new JSONFile((opts._[0] ? opts._[0] + "_" : '') + "database.json")
  );

  global.DATABASE = global.db;

  // database.
  global.loadDatabase = async function loadDatabase() {
    // Loading
    if (global.db.READ) return new Promise(resolve => setInterval(function () {
      if (!global.db.READ) {
        clearInterval(this);
        resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
      }
    }, 1000));


    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read();
    global.db.READ = false;
    global.db.data = {
      users: {},
      chats: {},
      stats: {},
      msgs: {},
      sticker: {},
      ...(global.db.data || {})
    };
    global.db.chain = _.chain(global.db.data);
  };
  loadDatabase();

  // Biar WA ngiranya kita buka dari browser beneran (Chrome di Windows, dll)
  const getBrowserInfo = (browserName = "Chrome") => {
    const platform = os.platform();
    const osName = platform === "win32" ? "Windows" : platform === "darwin" ? "MacOS" : "Linux";
    const osVersion = osName === "Linux" ? Browsers.ubuntu(browserName)[2] : "N/A";
    return [osName, browserName, osVersion];
  };

  // Nama file sesi
  const sessionName = '' + (opts._[0] || "sessions");
  global.isInit = !fs.existsSync(sessionName);

  const { state, saveCreds } = await useMultiFileAuthState(sessionName);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(chalk.magenta(`-- pake WA v${version.join('.')}, versi terbaru: ${isLatest} --`));

  const msgRetryCounterCache = new NodeCache();

  const socketConfig = {
    printQRInTerminal: false, // QR
    syncFullHistory: true, // Biar nrik semua riwayat chat
    markOnlineOnConnect: true, // Centang bir
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: "silent", stream: "store" }))
    },
    msgRetryCounterCache,
    browser: getBrowserInfo(), // Info browser yang kita pake
    logger: pino({ level: "silent" }), // Logger
    version,
    patchMessageBeforeSending: (message) => {
        const isViewOnce = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
        if (isViewOnce) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {}
                        },
                        ...message
                    }
                }
            };
        }
        return message;
    }
  };

  global.conn = simple.makeWASocket(socketConfig);

  if (!opts.test && global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write();
      // Bersihin file-file sampah di folder tmp
      if (!opts.tmp && (global.support || {}).find) {
        let tmp = [os.tmpdir(), "tmp"];
        tmp.forEach(dir => spawn("find", [dir, "-amin", "3", "-type", "f", "-delete"]));
      }
    }, 30 * 1000);
  }

  async function handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;
    global.timestamp.connect = new Date();
    // Kalo koneksi putus karena alasan aneh (bukan karena logout), coba konek lagi
    if (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut && conn.ws.readyState !== WebSocket.CONNECTING) {
      console.log(global.reloadHandler(true));
    }
    // kalo databasenya belum ke-load, load dulu
    if (global.db.data == null) await loadDatabase();
  }

  // Cek kalo file creds.json rusak, kalo rusak hapus aj
  if (fs.existsSync("./sessions/creds.json") && !conn.authState.creds.registered) {
    console.log(chalk.yellow("-- WARNING: File creds.json rusak, hapus dulu file itu --"));
    process.exit(0);
  }

  if (!conn.authState.creds.registered) {
    let phoneNumber = '';
    do {
      phoneNumber = await question(chalk.blueBright("MASUKKAN NOMOR WHATSAPP YANG BENAR, AWALI DENGAN KODE NEGARA. Contoh: 6281234567890\n"));
      if (!/^\d+$/.test(phoneNumber) || phoneNumber.length < 10) {
        console.log(chalk.red("Nomor tidak valid. Coba lagi."));
      }
    } while (!/^\d+$/.test(phoneNumber) || phoneNumber.length < 10);
    rl.close();
    phoneNumber = phoneNumber.replace(/\D/g, '');
    console.log(chalk.bgWhite(chalk.blue("-- Tunggu sebentar, sedang membuat kode... --")));
    setTimeout(async () => {
      let pairingCode = await conn.requestPairingCode(phoneNumber);
      pairingCode = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;
      console.log(chalk.black(chalk.bgGreen("Kode Pairing Kamu : ")), chalk.black(chalk.white(pairingCode)));
    }, 3000);
  }
  
  process.on("uncaughtException", console.error);

  const reloadModule = (module) => {
    module = require.resolve(module);
    let count = 0;
    do {
        if (module in require.cache) delete require.cache[module];
        var M = require(module);
        count++;
    } while ((!M || Array.isArray(M) || M instanceof String ? !(M || []).length : typeof M == 'object' && !Buffer.isBuffer(M) ? !Object.keys(M || {}).length : true) && count <= 10)
    return M;
  };

  let isFirstLoad = true;
  global.reloadHandler = function (isReloading) {
    let handler = reloadModule("./handler");
    if (isReloading) {
      try { global.conn.ws.close(); } catch {}
      global.conn = { ...global.conn, ...simple.makeWASocket(socketConfig) };
    }

    if (!isFirstLoad) {
      // Hapus listener lama biar ga numpuk
      conn.ev.off("messages.upsert", conn.handler);
      conn.ev.off("group-participants.update", conn.participantsUpdate);
      conn.ev.off("message.delete", conn.onDelete);
      conn.ev.off("connection.update", conn.connectionUpdate);
      conn.ev.off("creds.update", conn.credsUpdate);
    }
    
    conn.welcome = "Halo @user! Selamat datang di @subject. Jangan lupa baca deskripsi grup ya!\n@desc";
    conn.bye = "Selamat tinggal @user 👋";
    conn.promote = "@user sekarang jadi admin!";
    conn.demote = "Yah, @user turun jabatan.";
    
    conn.handler = handler.handler.bind(conn);
    conn.participantsUpdate = handler.participantsUpdate.bind(conn);
    conn.onDelete = handler.delete.bind(conn);
    conn.connectionUpdate = handleConnectionUpdate.bind(conn);
    conn.credsUpdate = saveCreds.bind(conn);

    conn.ev.on("messages.upsert", conn.handler);
    conn.ev.on("group-participants.update", conn.participantsUpdate);
    conn.ev.on("message.delete", conn.onDelete);
    conn.ev.on("connection.update", conn.connectionUpdate);
    conn.ev.on("creds.update", conn.credsUpdate);

    isFirstLoad = false;
    return true;
  };

  const pluginsDir = path.join(__dirname, "plugins");
  global.plugins = {};

function isJSFile(file) {
  return file.endsWith('.js');
}

function filesInit(dir = pluginsDir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      filesInit(fullPath);
    } else if (isJSFile(file)) {
      try {
        const module = require(fullPath);
        global.plugins[path.relative(pluginsDir, fullPath)] = module.default || module;
      } catch (e) {
        console.error(e);
        delete global.plugins[path.relative(pluginsDir, fullPath)];
      }
    }
  }
}

try {
  filesInit();
} catch (e) {
  console.error(e);
}

  global.reload = (_ev, relativePath) => {
  if (isJSFile(relativePath)) {
    const absPath = join(pluginsDir, relativePath);

    if (relativePath in global.plugins) {
      if (fs.existsSync(absPath)) {
        conn.logger.info(`🍃 Memuat ulang plugin '${relativePath}'`);
      } else {
        conn.logger.warn(`⚠️ Plugin '${relativePath}' telah dihapus`);
        return delete global.plugins[relativePath];
      }
    } else {
      conn.logger.info(`📢 Memuat plugin baru: '${relativePath}'`);
    }

    const fileContent = fs.readFileSync(absPath, 'utf8');
    const err = syntaxError(fileContent, absPath, {
      allowAwaitOutsideFunction: true,
    });

    if (err) {
      conn.logger.error(`❌ Syntax error saat memuat plugin '${relativePath}'\n${format(err)}`);
    } else {
      try {
        delete require.cache[require.resolve(absPath)];
        
        const module = require(absPath);
        global.plugins[relativePath] = module.default || module;
      } catch (e) {
        conn.logger.error(`❌ Error saat memuat plugin '${relativePath}'\n${format(e)}`);
      } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
      }
    }
  }
};

  Object.freeze(global.reload);

  chokidar.watch(pluginsDir, {
  ignored: [/(^|[\/\\])\../],
  persistent: true,
  ignoreInitial: true,
}).on('add', path => global.reload(null, path.replace(pluginsDir + '/', '')))
  .on('change', path => global.reload(null, path.replace(pluginsDir + '/', '')))
  .on('unlink', path => global.reload(null, path.replace(pluginsDir + '/', '')));
  global.reloadHandler();

  async function checkDependencies() {
    const results = await Promise.all([
      spawn("ffmpeg"),
      spawn("ffprobe"),
      spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-filter_complex", "color", "-frames:v", "1", "-f", "webp", "-"]),
      spawn("convert"),
      spawn("magick"),
      spawn("gm"),
      spawn("find", ["--version"])
    ].map(p => Promise.race([
      new Promise(resolve => { p.on("close", code => resolve(code !== 127)); }),
      new Promise(resolve => { p.on("error", _ => resolve(false)); })
    ])));
    
    let [hasFfmpeg, hasFfprobe, hasFfmpegWebp, hasConvert, hasMagick, hasGm, hasFind] = results;
    console.log(results);
    
    const installedTools = global.support = {
      ffmpeg: hasFfmpeg,
      ffprobe: hasFfprobe,
      ffmpegWebp: hasFfmpegWebp,
      convert: hasConvert,
      magick: hasMagick,
      gm: hasGm,
      find: hasFind
    };
    Object.freeze(global.support);

    if (!installedTools.ffmpeg) conn.logger.warn("ffmpeg belum keinstall, mungkin ga bisa kirim video.");
    if (installedTools.ffmpeg && !installedTools.ffmpegWebp) conn.logger.warn("Stiker animasi mungkin ga jalan tanpa libwebp di ffmpeg.");
    if (!installedTools.convert && !installedTools.magick && !installedTools.gm) conn.logger.warn("Fitur stiker mungkin ga jalan tanpa imagemagick.");
  }

  checkDependencies().then(() => conn.logger.info("Pengecekan selesai")).catch(console.error);

})();
