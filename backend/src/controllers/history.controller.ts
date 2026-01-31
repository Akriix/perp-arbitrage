import { Request, Response } from 'express';
import { getSpreadHistory } from '../db/database';
import { logger } from '../utils/app-logger';

const TAG = 'History';

export async function getSpreadHistoryController(req: Request, res: Response) {
    const { pair, period = '24h' } = req.query;

    if (!pair) {
        return res.status(400).json({ error: 'Pair is required' });
    }

    try {
        const periodStr = period as string;
        logger.debug(TAG, `Fetching history for ${pair} (${periodStr})`);
        const rows = await getSpreadHistory(pair as string, periodStr);

        // --- ADAPTIVE GRANULARITY CONFIG ---
        // --- ADAPTIVE GRANULARITY CONFIG (User Requested) ---
        let interval = 2; // default: 2 min for 24h (High Precision)
        if (periodStr === '7d') interval = 15; // 15 min for 7d
        else if (periodStr === '14d' || periodStr === 'all') interval = 30; // 30 min for 14d

        // --- DOWNSAMPLING LOGIC (Bucket Averaging) ---
        function downsampleData(rawData: any[], intervalMinutes: number) {
            const buckets: Record<string, any> = {};
            const intervalMs = intervalMinutes * 60 * 1000;

            rawData.forEach(point => {
                // SQLite returns YYYY-MM-DD HH:MM:SS (UTC)
                const timeString = point.timestamp.includes(' ') ? point.timestamp.replace(' ', 'T') + 'Z' : point.timestamp;
                const ts = new Date(timeString).getTime();

                if (isNaN(ts)) return;

                // Floor to nearest bucket
                const bucketTime = Math.floor(ts / intervalMs) * intervalMs;
                const key = bucketTime.toString();

                if (!buckets[key]) {
                    buckets[key] = {
                        timestamp: bucketTime,
                        spreads: [],
                        best_asks: [],
                        best_bids: []
                    };
                }

                buckets[key].spreads.push(point.spread);
                if (point.best_ask) buckets[key].best_asks.push(point.best_ask);
                if (point.best_bid) buckets[key].best_bids.push(point.best_bid);
            });

            return Object.values(buckets)
                .sort((a, b) => a.timestamp - b.timestamp)
                .map(bucket => {
                    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                    const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;

                    return {
                        timestamp: new Date(bucket.timestamp).toISOString(),
                        spread: parseFloat(max(bucket.spreads).toFixed(2)), // MAX Spread rule
                        lighter_price: parseFloat(avg(bucket.best_asks).toFixed(2)),
                        vest_price: parseFloat(avg(bucket.best_bids).toFixed(2))
                    };
                });
        }

        const data = downsampleData(rows, interval);

        // Calculate stats using ALL raw data for accuracy
        const fullSpreads = rows.map(r => r.spread).filter(s => s !== null && !isNaN(s));

        let stats = { current: 0, average: 0, min: 0, max: 0, percentile: 0 };

        if (fullSpreads.length > 0) {
            const current = fullSpreads[fullSpreads.length - 1];
            const min = Math.min(...fullSpreads);
            const max = Math.max(...fullSpreads);
            const average = fullSpreads.reduce((a: number, b: number) => a + b, 0) / fullSpreads.length;

            const sorted = [...fullSpreads].sort((a, b) => a - b);
            const rank = sorted.filter(v => v < current).length;
            const percentile = Math.round((rank / fullSpreads.length) * 100);

            stats = {
                current: parseFloat(current.toFixed(2)),
                average: parseFloat(average.toFixed(2)),
                min: parseFloat(min.toFixed(2)),
                max: parseFloat(max.toFixed(2)),
                percentile
            };
        }

        res.json({
            pair,
            period: periodStr,
            interval: `${interval}min`,
            dataPoints: data.length,
            data,
            stats
        });

    } catch (error) {
        logger.error(TAG, 'Error fetching history', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
}
