'use strict'
const { ERC20BridgeSource, SOURCE_FLAGS } = require('@0x/asset-swapper');
const BigNumber = require('bignumber.js');
const assert = require('assert');

const PROTOCOL_FEE = 70e3;
const GAS_STATION_URL = 'http://gas.api.0x.org/source/median?output=eth_gas_station';
const SRA_API_URL = 'https://api.0x.org/sra';
const TX_BASE_GAS = new BigNumber(21e3);

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
            return TX_BASE_GAS;
        } else if (SOURCE_FLAGS.LiquidityProvider === sourceFlags) {
            return TX_BASE_GAS.plus(10e3);
        } else {
            return new BigNumber(150e3);
        }
    },
    rfqt: { makerEndpointMaxResponseTimeMs: 600 },
};

module.exports = {
    SRA_API_URL,
    PROTOCOL_FEE,
    DEFAULT_MARKET_OPTS,
    GAS_STATION_URL,
};
