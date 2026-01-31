/**
 * Perp Arbitrage Scanner - Backend Server
 * Entry Point
 */

import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import routes from './routes/api-routes';
import { PORT } from './config';
import { startScheduler, setWebSocketBroadcaster } from './services/aggregator.service';
import { startDbScheduler } from './db/metrics-repo';
import { logger } from './utils/app-logger';

const TAG = 'Server';

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server });
let wsClients: WebSocket[] = [];

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
function broadcastPriceUpdate(priceCache: any) {
    if (wsClients.length === 0) return;

    logger.debug(TAG, `Broadcasting update to ${wsClients.length} clients. Cache size: ${Object.keys(priceCache).length}`);

    const pairs = Object.values(priceCache).map((pair: any) => ({
        symbol: pair.symbol,
        bestBid: pair.bestBid,
        bestAsk: pair.bestAsk,
        bestBidEx: pair.bestBidEx,
        bestAskEx: pair.bestAskEx,
        realSpread: pair.realSpread,
        paradex: pair.paradex,
        lighter: pair.lighter,
        vest: pair.vest,
        extended: pair.extended
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

export default app;
