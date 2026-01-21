/**
 * Perp Arbitrage Scanner - Backend Server
 * Entry Point
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const routes = require('./routes');
const { PORT } = require('./config');
const { startScheduler, setWebSocketBroadcaster } = require('./services/aggregator.service');
const { startDbScheduler } = require('./db/metrics.repository');
const { logger } = require('./utils/logger');

const TAG = 'Server';

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server });
let wsClients = [];

wss.on('connection', (ws) => {
    logger.info(TAG, 'WebSocket client connected');
    wsClients.push(ws);

    ws.on('close', () => {
        logger.debug(TAG, 'WebSocket client disconnected');
        wsClients = wsClients.filter(client => client !== ws);
    });

    ws.on('error', (error) => {
        logger.error(TAG, 'WebSocket error', error);
    });
});

// Broadcast function for aggregator
function broadcastPriceUpdate(priceCache) {
    if (wsClients.length === 0) return;

    logger.debug(TAG, `Broadcasting update to ${wsClients.length} clients. Cache size: ${Object.keys(priceCache).length}`);

    const pairs = Object.values(priceCache).map(pair => ({
        symbol: pair.symbol,
        bestBid: pair.bestBid,
        bestAsk: pair.bestAsk,
        bestBidEx: pair.bestBidEx,
        bestAskEx: pair.bestAskEx,
        realSpread: pair.realSpread,
        paradex: pair.paradex,
        lighter: pair.lighter,
        vest: pair.vest
    }));

    const message = JSON.stringify({ type: 'update', pairs });

    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                logger.error(TAG, 'Send error', error);
            }
        }
    });
}

// Register broadcaster with aggregator
setWebSocketBroadcaster(broadcastPriceUpdate);

// Middleware
app.use(express.json());

// Serve static files from frontend build (production)
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// API Routes
app.use('/api', routes);

// Start data fetching scheduler
startScheduler();

// Start database persistence scheduler
startDbScheduler();

// Start server
server.listen(PORT, () => {
    logger.info(TAG, `Server started on http://localhost:${PORT}`);
    logger.info(TAG, `WebSocket server ready on ws://localhost:${PORT}`);
});

module.exports = app;
