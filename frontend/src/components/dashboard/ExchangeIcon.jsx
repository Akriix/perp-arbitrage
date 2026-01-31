import { useState } from 'react';
import extendedIcon from '../../assets/extended.png';

const EXCHANGE_DOMAINS = {
    vest: 'vestmarkets.com',
    paradex: 'paradex.trade',
    lighter: 'lighter.xyz'
};

export default function ExchangeIcon({ exchange, className = "w-5 h-5" }) {
    const [error, setError] = useState(false);

    const name = exchange?.toLowerCase();
    const domain = EXCHANGE_DOMAINS[name];

    if (name === 'extended') {
        return (
            <img
                src={extendedIcon}
                alt={exchange}
                className={`${className} rounded-full bg-gray-800 object-cover`}
            />
        );
    }

    if (!domain || error) {
        // Fallback: First letter
        return (
            <div className={`${className} rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300`}>
                {name?.[0]?.toUpperCase()}
            </div>
        );
    }

    // Use Google Favicon service for reliability
    const src = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;

    return (
        <img
            src={src}
            alt={exchange}
            className={`${className} rounded-full bg-gray-800 object-cover`}
            onError={() => setError(true)}
        />
    );
}
