import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAudio } from './useAudio';

const ALERT_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/933/933-preview.mp3";
const EXIT_ALARM_URL = "https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3";

/**
 * Custom hook to manage application alarms (Scanner & Position Exit)
 * @param {Array} dynamicPairs - List of current market data
 * @param {Object} pairThresholds - User defined thresholds for pairs
 * @param {number} minSpread - Global minimum spread setting
 * @param {Array} positions - Active positions
 * @param {Function} updatePosition - Function to update a position
 * @param {boolean} soundEnabled - Whether sound is enabled
 */
export function useAppAlarms(dynamicPairs, pairThresholds, minSpread, positions, updatePosition, soundEnabled, disabledAlarms = []) {
    const [activeAlarm, setActiveAlarm] = useState(null); // Position exit alarm
    const [activeScannerAlarm, setActiveScannerAlarm] = useState(null); // New opportunity alarm
    const [acknowledgedScannerAlarms, setAcknowledgedScannerAlarms] = useState(new Set());

    // Sound utilities
    const playScannerSound = useAudio(ALERT_SOUND_URL, 0.5);
    const playExitSound = useAudio(EXIT_ALARM_URL, 0.5);

    // 1. Scanner Alarms Logic
    useEffect(() => {
        if (!dynamicPairs || dynamicPairs.length === 0) return;

        // Search for new scanner alarm opportunities
        if (!activeScannerAlarm) {
            for (const pair of dynamicPairs) {
                const spread = pair.realSpread || 0;
                const threshold = pairThresholds[pair.symbol] !== undefined ? pairThresholds[pair.symbol] : minSpread;
                const isCustom = pairThresholds.hasOwnProperty(pair.symbol);

                // Only trigger if custom threshold set, not acknowledged, and not disabled
                if (isCustom && spread >= threshold && !acknowledgedScannerAlarms.has(pair.symbol) && !disabledAlarms.includes(pair.symbol)) {
                    setActiveScannerAlarm(pair);
                    break;
                }

                // Auto-reset acknowledgment if spread falls below threshold
                if (acknowledgedScannerAlarms.has(pair.symbol) && spread < threshold) {
                    setAcknowledgedScannerAlarms(prev => {
                        const next = new Set(prev);
                        next.delete(pair.symbol);
                        return next;
                    });
                }
            }
        }
    }, [dynamicPairs, pairThresholds, minSpread, activeScannerAlarm, acknowledgedScannerAlarms]);

    // 2. Position Alarms Logic
    useEffect(() => {
        if (!dynamicPairs || dynamicPairs.length === 0) return;

        if (!activeAlarm) {
            for (const pos of positions) {
                const livePair = dynamicPairs.find(p => p.symbol === pos.symbol);
                if (livePair && livePair.realSpread !== -999 && livePair.realSpread <= pos.exitTargetSpread) {
                    if (!pos.lastAlarmTriggered || pos.lastAlarmTriggered !== pos.exitTargetSpread) {
                        setActiveAlarm(pos);
                        updatePosition(pos.id, { lastAlarmTriggered: pos.exitTargetSpread });
                        break;
                    }
                }
            }
        }
    }, [dynamicPairs, positions, activeAlarm, updatePosition]);


    // Sound Effects Loop
    useEffect(() => {
        if (!activeScannerAlarm || !soundEnabled) return;
        playScannerSound();
        const interval = setInterval(playScannerSound, 10000);
        return () => clearInterval(interval);
    }, [activeScannerAlarm, soundEnabled, playScannerSound]);

    useEffect(() => {
        if (!activeAlarm || !soundEnabled) return;
        playExitSound();
        const interval = setInterval(playExitSound, 10000);
        return () => clearInterval(interval);
    }, [activeAlarm, soundEnabled, playExitSound]);


    // Controls
    const stopAlarm = useCallback(() => setActiveAlarm(null), []);

    const stopScannerAlarm = useCallback(() => {
        if (activeScannerAlarm) {
            setAcknowledgedScannerAlarms(prev => {
                const next = new Set(prev);
                next.add(activeScannerAlarm.symbol);
                return next;
            });
            setActiveScannerAlarm(null);
        }
    }, [activeScannerAlarm]);

    return {
        activeAlarm,
        activeScannerAlarm,
        stopAlarm,
        stopScannerAlarm
    };
}
