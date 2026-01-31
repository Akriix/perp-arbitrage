/**
 * Exchange API Endpoints and Symbol Blacklist
 */

export const API_ENDPOINTS = {
    PARADEX: process.env.API_PARADEX || 'https://api.prod.paradex.trade/v1/markets/summary?market=ALL',
    PARADEX_WS: process.env.WS_PARADEX || 'wss://ws.api.prod.paradex.trade/v1',
    VEST_TICKER: process.env.API_VEST_TICKER || 'https://server-prod.hz.vestmarkets.com/v2/ticker/24hr',
    VEST_DEPTH: process.env.API_VEST_DEPTH || 'https://server-prod.hz.vestmarkets.com/v2/depth',
    LIGHTER: process.env.API_LIGHTER || 'https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails',
    LIGHTER_WS: process.env.WS_LIGHTER || 'wss://mainnet.zklighter.elliot.ai/stream',
    // Extended Exchange (Starknet Mainnet)
    EXTENDED_MARKETS: process.env.API_EXTENDED_MARKETS || 'https://api.starknet.extended.exchange/api/v1/info/markets'
};

// Blacklist: Stock tickers, FX pairs, indices (not crypto)
export const NON_CRYPTO_SYMBOLS = new Set([
    // Stocks
    'AAPL', 'AMD', 'AMZN', 'ARM', 'ASTS', 'BA', 'BABA', 'BITF', 'BMNR', 'CAT',
    'CC', 'CIFR', 'CLSK', 'COAI', 'COIN', 'CRCL', 'CRML', 'CVS', 'GLXY', 'GM',
    'GME', 'GOOG', 'HOOD', 'HRZN', 'IBIT', 'INTC', 'IONQ', 'JOBY', 'JPM',
    'KO', 'LCID', 'LLY', 'LUNR', 'MA', 'MARA', 'MCD', 'META', 'MSTR', 'NDAQ',
    'NKE', 'NVDA', 'PLTR', 'PYPL', 'QQQ', 'RDDT', 'REMX', 'RIOT', 'RKLB',
    'ROKU', 'SHOP', 'SLV', 'SMCI', 'SNAP', 'SOFI', 'SPX', 'SPY', 'SQ', 'SVMH',
    'TIGR', 'TSLA', 'TSM', 'UBER', 'UNH', 'V', 'VZ', 'WMT', 'XOM', 'ZG',
    // FX pairs
    'AUD', 'AUDUSD', 'CAD', 'CHF', 'EUR', 'EURUSD', 'GBP', 'GBPUSD', 'JPY',
    'NZD', 'USD', 'USDJPY', 'USDCAD', 'USDCHF',
    // Indices
    'DXY', 'SPX', 'NDX', 'VIX'
]);

export const isCrypto = (symbol: string): boolean => !NON_CRYPTO_SYMBOLS.has(symbol.toUpperCase());
