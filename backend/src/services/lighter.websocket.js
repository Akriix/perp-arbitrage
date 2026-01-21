/**
 * Lighter WebSocket Service
 * Connects to Lighter order book WebSocket for real-time bid/ask data
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const axios = require('axios');
const { API_ENDPOINTS, isCrypto } = require('../config/exchanges');
const { logger } = require('../utils/logger');

const WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream';
const TAG = 'LighterWS';

class LighterWebSocketService extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.reconnectDelay = 3000;
        this.marketIndexMap = {}; // symbol -> market_id
        this.orderBooks = {}; // symbol -> { bid, ask }
        this.pingInterval = null;
    }

    /**
     * Fetch market indices from REST API before connecting
     */
    async fetchMarketIndices() {
        try {
            logger.info(TAG, 'Fetching market indices...');
            const res = await axios.get(API_ENDPOINTS.LIGHTER, { timeout: 10000 });
            const markets = res.data.order_book_details || [];

            let count = 0;
            markets.forEach(m => {
                if (m.market_type === 'perp' && m.status === 'active' && m.market_id !== undefined) {
                    const symbol = m.symbol.split('-')[0];
                    if (isCrypto(symbol)) {
                        this.marketIndexMap[symbol] = m.market_id;
                        count++;
                    }
                }
            });

            logger.info(TAG, `Mapped ${count} market IDs`);
            if (this.marketIndexMap['RESOLV']) {
                logger.debug(TAG, `RESOLV ID: ${this.marketIndexMap['RESOLV']}`);
            }
            return count > 0;
        } catch (error) {
            logger.error(TAG, 'Failed to fetch market indices', error);
            return false;
        }
    }

    /**
     * Connect to Lighter WebSocket
     */
    async connect() {
        // First fetch market indices if empty
        if (Object.keys(this.marketIndexMap).length === 0) {
            const success = await this.fetchMarketIndices();
            if (!success) {
                logger.error(TAG, 'Cannot connect without market indices');
                setTimeout(() => this.connect(), this.reconnectDelay);
                return;
            }
        }

        try {
            logger.info(TAG, `Connecting to ${WS_URL}...`);
            this.ws = new WebSocket(WS_URL);

            this.ws.on('open', () => {
                logger.info(TAG, 'Connected successfully');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startPing();
                this.subscribeToAllMarkets();
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

    subscribeToAllMarkets() {
        const symbols = Object.keys(this.marketIndexMap);
        logger.info(TAG, `Subscribing to ${symbols.length} markets...`);

        let subCount = 0;
        symbols.forEach(symbol => {
            const marketId = this.marketIndexMap[symbol];
            this.subscribeToMarket(marketId);
            subCount++;
        });
        logger.debug(TAG, `Sent ${subCount} subscription requests`);
    }

    subscribeToMarket(marketId) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg = JSON.stringify({
            type: 'subscribe',
            channel: `order_book/${marketId}`
        });
        this.ws.send(msg);
    }

    handleMessage(data) {
        try {
            const msg = JSON.parse(data.toString());

            // Handle order book updates
            // Msg structure: { "type": "update/order_book", "channel": "order_book:51", "order_book": { asks: [], bids: [] } }
            if (msg.type === 'update/order_book' && msg.order_book) {
                const channelParts = msg.channel.split(':');
                if (channelParts.length !== 2) return;

                const marketId = parseInt(channelParts[1], 10);

                // Find symbol by marketId
                const symbol = Object.keys(this.marketIndexMap).find(
                    s => this.marketIndexMap[s] === marketId
                );

                if (!symbol) return;

                const ob = msg.order_book;

                // Maintain state: get previous values
                let currentBid = this.orderBooks[symbol]?.bid || 0;
                let currentAsk = this.orderBooks[symbol]?.ask || 0;
                let updated = false;

                // Update Bids
                if (ob.bids && ob.bids.length > 0) {
                    const validBids = ob.bids.map(b => {
                        // Handle both {price:...} and [price, size] formats
                        if (Array.isArray(b)) return parseFloat(b[0]);
                        return parseFloat(b.price || b[0]);
                    }).filter(p => !isNaN(p));

                    if (validBids.length > 0) {
                        const newBestBid = Math.max(...validBids);
                        if (newBestBid !== currentBid) {
                            currentBid = newBestBid;
                            updated = true;
                        }
                    }
                }

                // Update Asks
                if (ob.asks && ob.asks.length > 0) {
                    const validAsks = ob.asks.map(a => {
                        if (Array.isArray(a)) return parseFloat(a[0]);
                        return parseFloat(a.price || a[0]);
                    }).filter(p => !isNaN(p) && p > 0);

                    if (validAsks.length > 0) {
                        const newBestAsk = Math.min(...validAsks);
                        if (newBestAsk !== currentAsk) {
                            currentAsk = newBestAsk;
                            updated = true;
                        }
                    }
                }

                // If updated or if it's the first time we see valid prices for this symbol
                if ((updated || !this.orderBooks[symbol]) && (currentBid > 0 || currentAsk > 0)) {
                    this.orderBooks[symbol] = { bid: currentBid, ask: currentAsk };

                    // Emit update event with current state (merged with past state)
                    this.emit('update', {
                        symbol,
                        bid: currentBid,
                        ask: currentAsk
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
                    this.ws.ping();
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
            // Exponential backoff: 3s, 6s, 12s, 24s... capped at 30s
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            logger.info(TAG, `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), delay);
        } else {
            logger.warn(TAG, 'Max reconnection attempts reached. Will retry in 1 minute.');
            setTimeout(() => {
                this.reconnectAttempts = 0;
                this.connect();
            }, 60000);
        }
    }

    getOrderBooks() {
        return this.orderBooks;
    }
}

module.exports = new LighterWebSocketService();
