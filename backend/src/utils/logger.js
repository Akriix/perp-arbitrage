/**
 * Logger Utility
 * Centralized logging with structured output and log levels
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Current log level (can be set via environment variable)
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

/**
 * Format timestamp for log output
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message with tag and timestamp
 */
function formatMessage(level, tag, message) {
    return `${getTimestamp()} [${level}] [${tag}] ${message}`;
}

const logger = {
    /**
     * Debug level logging (verbose, disabled in production)
     */
    debug(tag, message, data = null) {
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
    info(tag, message, data = null) {
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
    warn(tag, message, data = null) {
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
    error(tag, message, error = null) {
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

module.exports = { logger, LOG_LEVELS };
