'use strict'
const { ERC20BridgeSource, SOURCE_FLAGS } = require('@0x/asset-swapper');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');

const BigNumber = require('bignumber.js');
const { TX_BASE_GAS } = require('./constants');

const FILL_QUOTE_TRANSFORMER_GAS_OVERHEAD = new BigNumber(150e3);
const MULTIPLEX_BATCH_FILL_SOURCE_FLAGS =
    SOURCE_FLAGS.Uniswap_V2 | SOURCE_FLAGS.SushiSwap | SOURCE_FLAGS.LiquidityProvider | SOURCE_FLAGS.RfqOrder;
const MULTIPLEX_MULTIHOP_FILL_SOURCE_FLAGS =
    SOURCE_FLAGS.Uniswap_V2 | SOURCE_FLAGS.SushiSwap | SOURCE_FLAGS.LiquidityProvider

const DEFAULT_MARKET_OPTS = {
    excludedSources: [],
    includedSources: [],
    runLimit: 2 ** 8,
    bridgeSlippage: 0.01,
    maxFallbackSlippage: 0.015,
    numSamples: 13,
    sampleDistributionBase: 1.05,
    allowFallback: true,
    exchangeProxyOverhead: sourceFlags => {
        if ([SOURCE_FLAGS.Uniswap_V2, SOURCE_FLAGS.SushiSwap].includes(sourceFlags)) {
            // Uniswap VIP
            return TX_BASE_GAS;
        } else if (SOURCE_FLAGS.LiquidityProvider === sourceFlags) {
            // PLP VIP
            return TX_BASE_GAS.plus(10e3);
        } else if ((MULTIPLEX_BATCH_FILL_SOURCE_FLAGS | sourceFlags) === MULTIPLEX_BATCH_FILL_SOURCE_FLAGS) {
            // Multiplex batch fill
            return TX_BASE_GAS.plus(25e3);
        } else if (
            (MULTIPLEX_MULTIHOP_FILL_SOURCE_FLAGS | sourceFlags) ===
            (MULTIPLEX_MULTIHOP_FILL_SOURCE_FLAGS | SOURCE_FLAGS.MultiHop)
        ) {
            // Multiplex multi-hop fill
            return TX_BASE_GAS.plus(25e3);
        } else {
            return FILL_QUOTE_TRANSFORMER_GAS_OVERHEAD;
        }
    },
    rfqt: { makerEndpointMaxResponseTimeMs: 600 },
};

const DEFAULT_MARKET_OPTS_BY_CHAIN_ID = {
    '1': DEFAULT_MARKET_OPTS,
    '3': DEFAULT_MARKET_OPTS,
    '56': {
        ...DEFAULT_MARKET_OPTS,
        exchangeProxyOverhead: sourceFlags => {
            if ([SOURCE_FLAGS.SushiSwap, SOURCE_FLAGS.PancakeSwap, SOURCE_FLAGS.BakerySwap].includes(sourceFlags)) {
                return TX_BASE_GAS;
            }
            return DEFAULT_MARKET_OPTS.exchangeProxyOverhead(sourceFlags);
        },
    }
}
const CONFIG_BY_CHAIN_ID = {
    '1': {
        chainId: 1,
        addresses: getContractAddressesForChainOrThrow(1),
        gasTokenSymbol: 'ETH',
        wrappedGasTokenSymbol: 'WETH',
        tokens: require('./tokens-by-chain')['1'],
        intermediateTokens: ['WETH','DAI','USDC','USDT','WBTC'],
        protocolFee: 70e3,
        marketOpts: DEFAULT_MARKET_OPTS,
    },
    '3': {
        chainId: 3,
        addresses: getContractAddressesForChainOrThrow(3),
        gasTokenSymbol: 'ETH',
        wrappedGasTokenSymbol: 'WETH',
        tokens: require('./tokens-by-chain')['3'],
        intermediateTokens: ['WETH'],
        protocolFee: 70e3,
        marketOpts: DEFAULT_MARKET_OPTS,
    },
    '56': {
        chainId: 56,
        addresses: getContractAddressesForChainOrThrow(56),
        gasTokenSymbol: 'BNB',
        wrappedGasTokenSymbol: 'WBNB',
        tokens: require('./tokens-by-chain')['56'],
        intermediateTokens: ['WBNB','USDC','USDT','BTC'],
        protocolFee: 0,
        marketOpts: {
            ...DEFAULT_MARKET_OPTS,
            exchangeProxyOverhead: sourceFlags => {
                if ([SOURCE_FLAGS.SushiSwap, SOURCE_FLAGS.PancakeSwap, SOURCE_FLAGS.BakerySwap].includes(sourceFlags)) {
                    return TX_BASE_GAS;
                }
                return DEFAULT_MARKET_OPTS.exchangeProxyOverhead(sourceFlags);
            },
        },
    }
};

module.exports = {
    getChainConfig(chainId) {
        const config = CONFIG_BY_CHAIN_ID[chainId];
        if (!config) {
            console.log(`${chainId}`);
            throw new Error(`No config for chain ${chainId}`);
        }
        return config;
    }
}
