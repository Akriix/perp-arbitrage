# V3 Execution Feasibility Study

## Executive Summary

This research examines the technical feasibility of automated and atomic execution for cross-exchange perpetual futures arbitrage between **Paradex**, **Vest**, and **Lighter**.

**Key Findings:**
- ✅ All three exchanges support programmatic order execution via API
- ⚠️ No native "atomic bundle" support—execution requires two separate orders
- ⚠️ Cross-exchange atomic execution is **not feasible** with current infrastructure
- ✅ Rapid sequential execution (~500-1000ms total) is achievable
- ✅ zkLend on Starknet provides flashloans for capital-efficient arbitrage

---

## 1. Exchange API Execution Capabilities

### Paradex (Starknet L2)

| Feature | Details |
|---------|---------|
| **Authentication** | Private key signing (Starknet) |
| **Order Types** | Market, Limit, Stop-Loss, Take-Profit |
| **SDKs** | [paradex-py](https://github.com/tradeparadex/paradex-py), [paradex-js](https://github.com/tradeparadex/paradex.js) |
| **Signing** | Starknet EIP-712 style signatures |
| **API Latency** | ~100-200ms (L2 settlement) |
| **Maker/Taker Fees** | 0.02% / 0.05% |

**Key Points:**
- Subkeys can be used for trading without exposing main private key
- JWT tokens available for read-only access
- Full trading requires private key signing for each order

### Vest (L2/Rollup)

| Feature | Details |
|---------|---------|
| **Authentication** | EIP-712 typed data signatures |
| **Order Types** | MARKET, LIMIT, STOP_LOSS, TAKE_PROFIT |
| **API Endpoint** | `POST /v2/createOrder` |
| **Signing** | Wallet private key with EIP-712 domain |
| **API Latency** | ~500ms (API to execution) |
| **Maker/Taker Fees** | 0.01% / 0.04% |

**Key Points:**
- All orders must be signed with EIP-712 typed data
- Verifying contract: `0x919386306C47b2Fe1036e3B4F7C40D22D2461a23`
- Header required: `xrestservermm: restserver{account_group}`

### Lighter (ZK Rollup)

| Feature | Details |
|---------|---------|
| **Authentication** | API key + signature |
| **Order Types** | Market, Limit (Post-Only, Reduce-Only) |
| **Order Features** | GTC, IOC, FOK, GTT (expiration) |
| **API Latency** | ~200-300ms |
| **Maker/Taker Fees** | 0.00% / 0.03% |

**Key Points:**
- Non-custodial: funds stay in wallet until execution
- Self-trade prevention built-in
- Liquidation engine with partial liquidations

---

## 2. Atomic Execution Analysis

### Can We Execute Atomically?

**Short Answer: No**, true atomic cross-exchange execution is not possible.

**Reasons:**
1. **Different Chains/L2s**: Each exchange operates on different infrastructure
   - Paradex: Starknet
   - Vest: Custom L2
   - Lighter: ZK Rollup
2. **No Cross-Chain Atomicity**: No mechanism to bundle transactions across different chains
3. **Separate Order Books**: Each exchange has independent matching engines

### Mitigation Strategy: Rapid Sequential Execution

Since atomic execution is impossible, we employ:

```
┌─────────────────────────────────────────────────────────┐
│  Spread Detection (WebSocket)                           │
│       ↓                                                 │
│  Validate Spread > Threshold (0.15%+)                  │
│       ↓                                                 │
│  [Parallel] Sign Both Orders (EIP-712/Starknet)        │
│       ↓                                                 │
│  Execute Order 1 (Buy at lower exchange)               │
│       ↓ (~200ms)                                        │
│  Execute Order 2 (Sell at higher exchange)             │
│       ↓ (~200ms)                                        │
│  Verify Both Fills                                      │
└─────────────────────────────────────────────────────────┘
```

**Target Execution Time:** 400-600ms total

### Desynchronization Risk

| Risk Level | Conditions | Action |
|------------|------------|--------|
| **Bas** | Data <1s old, time diff <500ms | Execute |
| **Moyen** | Data 1-5s old, time diff 500-2000ms | Execute with caution |
| **Haut** | Data >5s old, time diff >2000ms | Skip opportunity |

---

## 3. Flashloan Research

### Starknet Flashloans (For Paradex)

**Provider: zkLend** ([docs.zklend.com](https://docs.zklend.com))

| Feature | Details |
|---------|---------|
| **Chain** | Starknet |
| **Assets** | ETH, USDC, USDT, DAI, STRK |
| **Fee** | 0.05% of borrowed amount |
| **Integration** | Cairo smart contract |

**Use Case for Arbitrage:**
```cairo
// Pseudo-code for Starknet flashloan arbitrage
1. Borrow $10,000 USDC from zkLend
2. Buy 0.1 BTC on Paradex at $100,000
3. Sell 0.1 BTC on external DEX/bridge
4. Repay $10,005 USDC to zkLend
5. Keep profit
```

**Limitation:** Cannot atomically execute on Vest/Lighter from Starknet

### Arbitrum Flashloans (For Cross-L2)

Potential providers:
- **Aave V3** on Arbitrum
- **Balancer** flash swaps
- **Uniswap V3** flash swaps

**Challenge:** Vest and Lighter are not on Arbitrum, making cross-exchange flashloans impractical.

---

## 4. Execution Simulator

An `ExecutionSimulator.ts` service has been created to simulate trades:

### Features
- **Real-time simulation** on spread detection
- **Fee calculation** (maker/taker per exchange)
- **Slippage estimation** based on position size
- **Gas cost estimation** per chain
- **Desync risk assessment** based on data freshness

### Output Format
```
[SIMULATION] ✅ BTC-USD-PERP | Spread: 0.25% | vest → paradex | 
  Profit Net potentiel: $1.45 | Risque de désynchronisation: Bas
  └─ Détails: Brut=$2.50 | Frais=$1.05 (trading: $0.75, gas: $0.15, slippage: $0.15)
```

### Integration
```typescript
import { executionSimulator } from './services/ExecutionSimulator';

// On spread detection from aggregator
const result = executionSimulator.onSpreadDetected(symbol, exchangePrices);
if (result?.profitable && result.desyncRisk === 'Bas') {
  // High-confidence opportunity detected
}
```

---

## 5. Recommendations

### Phase 1: Dry-Run Validation (Current)
- [x] Implement ExecutionSimulator
- [ ] Collect 1+ week of simulation data
- [ ] Analyze profitable opportunities frequency
- [ ] Validate desync risk model accuracy

### Phase 2: Single-Exchange Execution
- [ ] Implement order signing for one exchange (suggest: Lighter - lowest fees)
- [ ] Execute small test orders ($10-50)
- [ ] Measure real latency vs. estimated

### Phase 3: Cross-Exchange Execution
- [ ] Implement parallel order signing
- [ ] Build execution engine with rollback logic
- [ ] Start with minimal position sizes
- [ ] Implement stop-loss for stuck positions

### Phase 4: Capital Efficiency (Optional)
- [ ] Explore zkLend flashloans for Paradex-only arb
- [ ] Consider bridging solutions for cross-L2 capital movement

---

## 6. Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Price movement during execution | High | Fast execution (<1s), tight spreads only |
| Order rejection/partial fill | Medium | Retry logic, position hedging |
| API downtime | Medium | Multi-exchange fallback |
| Smart contract bugs | High | Extensive testing, small initial sizes |
| Desynchronized data | High | Stale data detection (implemented) |

---

## Conclusion

**Cross-exchange atomic execution is not technically feasible** with current infrastructure. However, **rapid sequential execution** (400-600ms) combined with proper risk management makes arbitrage viable for opportunities with >0.15% spreads.

The implemented `ExecutionSimulator` provides a safe dry-run environment to validate the strategy before committing real capital.

**Next Step:** Run simulation for 1-2 weeks to collect data on:
1. Frequency of profitable opportunities
2. Average theoretical profit per trade
3. Desync risk distribution
