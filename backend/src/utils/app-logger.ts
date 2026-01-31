/**
 * Logger Utility
 * Centralized logging with structured output and log levels
 */

export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Current log level (can be set via environment variable)
const RAW_LEVEL = process.env.LOG_LEVEL?.toUpperCase();
const CURRENT_LEVEL = (RAW_LEVEL && RAW_LEVEL in LOG_LEVELS)
    ? LOG_LEVELS[RAW_LEVEL as keyof typeof LOG_LEVELS]
    : LOG_LEVELS.INFO;

/**
 * Format timestamp for log output
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message with tag and timestamp
 */
function formatMessage(level: string, tag: string, message: string) {
    return `${getTimestamp()} [${level}] [${tag}] ${message}`;
}

export const logger = {
    /**
     * Debug level logging (verbose, disabled in production)
     */
    debug(tag: string, message: string, data: any = null) {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            const formatted = formatMessage('DEBUG', tag, message);
            if (data) {
                console.log(formatted, data);
            } else {
                console.log(formatted);
            }
        }
    },

    /**
     * Info level logging (general operational messages)
     */
    info(tag: string, message: string, data: any = null) {
        if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
            const formatted = formatMessage('INFO', tag, message);
            if (data) {
                console.log(formatted, data);
            } else {
                console.log(formatted);
            }
        }
    },

    /**
     * Warning level logging (potential issues)
     */
    warn(tag: string, message: string, data: any = null) {
        if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
            const formatted = formatMessage('WARN', tag, message);
            if (data) {
                console.warn(formatted, data);
            } else {
                console.warn(formatted);
            }
        }
    },

    /**
     * Error level logging (errors and exceptions)
     */
    error(tag: string, message: string, error: any = null) {
        if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
            const formatted = formatMessage('ERROR', tag, message);
            if (error) {
                console.error(formatted, error.message || error);
            } else {
                console.error(formatted);
            }
        }
    }
};
