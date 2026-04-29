import fs from "fs";
import path from "path";
import util from "util";
// Define log levels with default colors (will be updated with chalk dynamically)
const logLevels = {
  fatal: {
    color: (msg: any) => msg,
    level: 0
  },
  error: {
    color: (msg: any) => msg,
    level: 1
  },
  warn: {
    color: (msg: any) => msg,
    level: 2
  },
  info: {
    color: (msg: any) => msg,
    level: 3
  },
  debug: {
    color: (msg: any) => msg,
    level: 4
  }
};

// Always set the log level to 'debug' to show all logs
const LOG_LEVEL = 'debug';

// Utility to format timestamp
const formatTimestamp = () => new Date().toISOString();

// Dynamically import chalk and apply colors to log levels
async function loadChalk() {
  try {
    const chalk = (await import('chalk')).default;
    logLevels.fatal.color = chalk.bold.red;
    logLevels.error.color = chalk.red;
    logLevels.warn.color = chalk.yellow;
    logLevels.info.color = chalk.green;
    logLevels.debug.color = chalk.blue;
  } catch (err: any) {
    console.error("Failed to load chalk, defaulting to plain text logging.");
  }
}

// Initialize chalk colors (run this once on startup)
loadChalk().catch(console.error);

// General log function
function log(level: any, ...args: any[]) {
  const logLevel = logLevels[level as keyof typeof logLevels];
  if (logLevel && logLevel.level <= logLevels[LOG_LEVEL as keyof typeof logLevels].level) {
    const timestamp = formatTimestamp();
    const message = util.format(...args);
    const formattedMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Console output with dynamic color (color applied once chalk is loaded)
    console.log(logLevel.color ? logLevel.color(formattedMessage) : formattedMessage);

    // Asynchronous file output for errors
    if (level === 'error' || level === 'fatal') {
      fs.promises.appendFile(path.join(__dirname, 'error.log'), `${formattedMessage}\n`).catch((err: any) => console.error("Failed to write to error log file:", err));
    }
  }
}

// Global logger object
const logger = {
  fatal: (...args: any[]) => log('fatal', ...args),
  error: (...args: any[]) => log('error', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  info: (...args: any[]) => log('info', ...args),
  debug: (...args: any[]) => log('debug', ...args)
};

// Error handler function
function handleError(error: any, isFatal: boolean = false) {
  const errorMsg = error instanceof Error ? error.stack || error.message : error;
  logger.error(`Error encountered: ${errorMsg}`);
  if (isFatal) {
    logger.fatal("Fatal error encountered, shutting down...");
    process.exit(1); // Exit only for fatal errors
  }
}

// :3 Exporting logger and error handler 
export { logger, handleError };
export default {
  logger,
  handleError
};