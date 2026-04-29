import fs from "fs";
import path from "path";
/**
 * Global Button Storage
 * Generic JSON storage for persistent buttons across all modules.
 * Saves/Loads button metadata to/from data/{moduleName}/{guildId}.json
 */

// Base data directory
const BASE_DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Ensure module directory exists
 */
function ensureModuleDir(moduleName: any) {
  const dir = path.join(BASE_DATA_DIR, moduleName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
  return dir;
}

/**
 * Get file path for a guild's buttons in a module
 */
function getFilePath(moduleName: any, guildId: any) {
  const dir = ensureModuleDir(moduleName);
  return path.join(dir, `${guildId}.json`);
}

/**
 * Load all buttons for a specific module (all guilds)
 * Used on startup to restore handlers
 */
function loadAllButtons(moduleName: any) {
  const dir = ensureModuleDir(moduleName);
  const result = new Map(); // guildId -> buttonsMap

  try {
    if (!fs.existsSync(dir)) return result;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const guildId = file.replace('.json', '');
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const data = JSON.parse(content);
        // Data format: { buttons: { customId: meta, ... }, ...others }
        if (data.buttons) {
          result.set(guildId, data.buttons);
        }
      } catch (err: any) {
        console.error(`[GlobalStorage] Failed to load ${moduleName}/${file}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[GlobalStorage] Failed to read dir ${moduleName}:`, err.message);
  }
  return result;
}

/**
 * Save buttons for a guild in a module
 * Merges with existing data to avoid data loss
 */
function saveButtons(moduleName: any, guildId: any, newButtons: any) {
  const filePath = getFilePath(moduleName, guildId);
  let data = {};
  try {
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err: any) {
    // Ignore read error, start fresh
  }
  data.buttons = {
    ...(data.buttons || {}),
    ...newButtons
  };

  // Filter expired
  const now = Date.now();
  for (const id in data.buttons) {
    if (data.buttons[id].expiresAt && data.buttons[id].expiresAt < now) {
      delete data.buttons[id];
    }
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err: any) {
    console.error(`[GlobalStorage] Failed to save ${moduleName}/${guildId}:`, err.message);
    return false;
  }
}

/**
 * Filter and format buttons for registration
 * Returns array of metas
 */
function getValidButtons(moduleName: any) {
  const all = loadAllButtons(moduleName);
  const valid = [];
  const now = Date.now();
  for (const [guildId, buttons] of all.entries()) {
    for (const [customId, meta] of Object.entries(buttons)) {
      if (!meta.expiresAt || meta.expiresAt > now) {
        valid.push({
          ...meta,
          guildId,
          customId
        });
      }
    }
  }
  return valid;
}
export { saveButtons, loadAllButtons, getValidButtons };
export default {
  saveButtons,
  loadAllButtons,
  getValidButtons
};