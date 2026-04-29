import { GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";
import https from "https";
// shared font registration for @napi-rs/canvas
// auto-downloads missing fonts on first call, then registers them

const FONTS_DIR = path.join(__dirname, '..', '..', 'data', 'fonts');

// font definitions — name, filename, and download url
const FONTS = [{
  name: 'Inter',
  file: 'Inter.ttf',
  url: 'https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.ttf'
}, {
  name: 'Noto Color Emoji',
  file: 'NotoColorEmoji.ttf',
  url: 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf'
}];
let registered = false;
let registering = null;

/**
 * download a file from url to dest, following redirects (github uses 302)
 */
function downloadFile(url: any, dest: any, maxRedirects: number = 5) {
  return new Promise((resolve: any, reject: any) => {
    if (maxRedirects <= 0) return reject(new Error('too many redirects'));
    const file = fs.createWriteStream(dest);
    (https.get(url, res => {
      // follow redirects (github raw urls redirect)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }) as any).on('error', (err: any) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * ensure all fonts are downloaded and registered
 * safe to call multiple times — only runs once
 */
async function registerFonts() {
  if (registered) return;

  // prevent multiple parallel registration attempts
  if (registering) return registering;
  registering = (async () => {
    try {
      // create fonts dir if missing
      if (!fs.existsSync(FONTS_DIR)) {
        fs.mkdirSync(FONTS_DIR, {
          recursive: true
        });
      }
      for (const font of FONTS) {
        const fontPath = path.join(FONTS_DIR, font.file);

        // download if missing
        if (!fs.existsSync(fontPath)) {
          console.log(`[Fonts] ⬇️  downloading ${font.name}...`);
          try {
            await downloadFile(font.url, fontPath);
            console.log(`[Fonts] ✅ downloaded ${font.name}`);
          } catch (err: any) {
            console.error(`[Fonts] ❌ failed to download ${font.name}:`, err.message);
            continue; // skip registration if download failed
          }
        }

        // register the font
        GlobalFonts.registerFromPath(fontPath, font.name);
      }
      registered = true;
      console.log('[Fonts] ✅ all fonts registered');
    } catch (err: any) {
      console.error('[Fonts] ❌ font registration failed:', err.message);
    }
  })();
  return registering;
}
export { registerFonts };
export default {
  registerFonts
};