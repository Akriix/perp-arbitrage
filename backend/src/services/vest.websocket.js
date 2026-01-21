/**
 * Vest WebSocket Service
 * Connects to Vest Exchange WebSocket for real-time orderbook depth data
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { ALLOWED_SYMBOLS } = require('../config');
const { logger } = require('../utils/logger');

const WS_BASE_URL = 'wss://wsprod.vest.exchange/ws-api?version=1.0';
const TAG = 'VestWS';

class VestWebSocketService extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.reconnectDelay = 3000;
        this.pingInterval = null;
        this.subscribedSymbols = new Set();
    }

    /**
     * Connect to Vest WebSocket
     */
    async connect() {
        try {
            // Requirement: xwebsocketserver=restserver
            const url = `${WS_BASE_URL}&xwebsocketserver=restserver`;
            logger.info(TAG, `Connecting to ${url}...`);

            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                logger.info(TAG, 'Connected successfully');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startPing();
                this.subscribeToAllowedMarkets();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('error', (error) => {
                logger.error(TAG, 'WebSocket error', error);
            });

            this.ws.on('close', () => {
                logger.info(TAG, 'Connection closed');
                this.isConnected = false;
                this.stopPing();
                this.scheduleReconnect();
            });

        } catch (error) {
            logger.error(TAG, 'Connection error', error);
            this.scheduleReconnect();
        }
    }

    subscribeToAllowedMarkets() {
        const params = ALLOWED_SYMBOLS.map(symbol => `${symbol}-PERP@depth`);
        logger.debug(TAG, `Subscribing to: ${params.join(', ')}`);

        const msg = {
            method: 'SUBSCRIBE',
            params: params,
            id: Date.now()
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    handleMessage(data) {
        try {
            const msg = JSON.parse(data.toString());

            // Handle depth updates
            // Format: { "channel": "BTC-PERP@depth", "data": { "bids": [[price, qty]], "asks": [[price, qty]] } }
            if (msg.channel && msg.channel.endsWith('@depth') && msg.data) {
                const symbol = msg.channel.split('-')[0];
                const { bids, asks } = msg.data;

                const bid = bids && bids.length > 0 ? parseFloat(bids[0][0]) : 0;
                const ask = asks && asks.length > 0 ? parseFloat(asks[0][0]) : 0;

                if (bid > 0 || ask > 0) {
                    this.emit('update', {
                        symbol,
                        bid,
                        ask
                    });
                }
            }
        } catch (error) {
            // Ignore parse errors
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.isConnected) {
                try {
                    // Vest ping format
                    this.ws.send(JSON.stringify({
                        method: 'PING',
                        params: [],
                        id: 0
                    }));
                } catch (e) { }
            }
        }, 30000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            // Exponential backoff: 3s, 6s, 9s, 12s, 15s (capped)
            const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
            logger.info(TAG, `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), delay);
        } else {
            logger.error(TAG, 'Max reconnection attempts reached');
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = new VestWebSocketService();
