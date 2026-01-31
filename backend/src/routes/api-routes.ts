/**
 * API Routes
 */

import express from 'express';
import { getScans } from '../services/aggregator.service';
import { getSpreadHistoryController } from '../controllers/history.controller';
import { getAlertsHistory } from '../controllers/alert.controller';

const router = express.Router();

// Existing routes
router.get('/scans', (req, res) => {
    const cache = getScans();
    const pairs = Object.values(cache);
    res.json({ pairs });
});

router.get('/spread-history', getSpreadHistoryController);
router.get('/alerts', getAlertsHistory);

export default router;
