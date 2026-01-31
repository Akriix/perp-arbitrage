import { Request, Response } from 'express';
import { getRecentAlerts } from '../services/alert.service';

export const getAlertsHistory = async (req: Request, res: Response) => {
    try {
        const alerts = await getRecentAlerts(50);
        res.json({ success: true, alerts });
    } catch (error) {
        console.error("Alert History Error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch alerts" });
    }
};
