'use strict'
const { ERC20BridgeSource, SOURCE_FLAGS } = require('@0x/asset-swapper');
const BigNumber = require('bignumber.js');
const assert = require('assert');

const PROTOCOL_FEE = 70e3;
const GAS_STATION_URL = 'http://gas.api.0x.org/source/median?output=eth_gas_station';

const GAS_SCHEDULE = {
    [ERC20BridgeSource.Native]: () => 150e3,
    [ERC20BridgeSource.Uniswap]: () => 90e3,
    [ERC20BridgeSource.LiquidityProvider]: () => 140e3,
    [ERC20BridgeSource.Eth2Dai]: () => 400e3,
    [ERC20BridgeSource.Kyber]: () => 500e3,
    [ERC20BridgeSource.Curve]: fillData => {
        switch (fillData.pool.poolAddress.toLowerCase()) {
            case '0xa5407eae9ba41422680e2e00537571bcc53efbfd':
            case '0x93054188d876f558f4a66b2ef1d97d16edf0895b':
            case '0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714':
            case '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7':
                return 150e3;
            case '0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56':
                return 750e3;
            case '0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51':
                return 850e3;
            case '0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27':
                return 1e6;
            case '0x52ea46506b9cc5ef470c5bf89f17dc28bb35d85c':
                return 600e3;
            default:
                throw new Error(`Unrecognized Curve address: ${fillData.curve.poolAddress}`);
        }
    },
    [ERC20BridgeSource.MultiBridge]: () => 350e3,
    [ERC20BridgeSource.UniswapV2]: fillData => {
        // TODO: Different base cost if to/from ETH.
        let gas = 90e3;
        const path = fillData.tokenAddressPath;
        if (path.length > 2) {
            gas += (path.length - 2) * 60e3; // +60k for each hop.
        }
        return gas;
    },
    [ERC20BridgeSource.SushiSwap]: fillData => {
        // TODO: Different base cost if to/from ETH.
        let gas = 95e3;
        const path = fillData.tokenAddressPath;
        if (path.length > 2) {
            gas += (path.length - 2) * 60e3; // +60k for each hop.
        }
        return gas;
    },
    [ERC20BridgeSource.Balancer]: () => 120e3,
    [ERC20BridgeSource.Cream]: () => 300e3,
    [ERC20BridgeSource.MStable]: () => 300e3,
    [ERC20BridgeSource.Mooniswap]: () => 700e3,
    [ERC20BridgeSource.Swerve]: () => 150e3,
    [ERC20BridgeSource.SnowSwap]: fillData => {
        switch (fillData.pool.poolAddress.toLowerCase()) {
            case '0xbf7ccd6c446acfcc5df023043f2167b62e81899b':
                return 1000e3;
            case '0x4571753311e37ddb44faa8fb78a6df9a6e3c6c0b':
                return 1500e3;
            default:
                throw new Error('Unrecognized SnowSwap address');
        }
    },
    [ERC20BridgeSource.Shell]: () => 300e3,
    [ERC20BridgeSource.MultiHop]: fillData => {
        const firstHop = fillData.firstHopSource;
        const secondHop = fillData.secondHopSource;
        const firstHopGas = GAS_SCHEDULE[firstHop.source](firstHop.fillData) || 0;
        const secondHopGas = GAS_SCHEDULE[secondHop.source](secondHop.fillData) || 0;
        return new BigNumber(firstHopGas)
            .plus(secondHopGas)
            .plus(30e3)
            .toNumber();
    },
    [ERC20BridgeSource.Dodo]: fillData => {
        // Sell base is cheaper as it is natively supported
        // sell quote requires additional calculation and overhead
        return fillData.isSellBase ? 440e3 : 540e3;
    },
    [ERC20BridgeSource.Bancor]: () => 0,
};

const FEE_SCHEDULE = Object.assign(
    {},
    ...Object.keys(GAS_SCHEDULE).map(k => ({
        [k]:
            k === ERC20BridgeSource.Native
                ? fillData => new BigNumber(PROTOCOL_FEE).plus(GAS_SCHEDULE[k](fillData))
                : fillData => GAS_SCHEDULE[k](fillData),
    })),
);

const SRA_API_URL = 'https://api.0x.org/sra';

const DEFAULT_MARKET_OPTS = {
    excludedSources: [],
    includedSources: [],
    runLimit: 2 ** 8,
    bridgeSlippage: 0.01,
    maxFallbackSlippage: 0.015,
    numSamples: 13,
    sampleDistributionBase: 1.05,
    allowFallback: true,
    feeSchedule: FEE_SCHEDULE,
    gasSchedule: GAS_SCHEDULE,
    exchangeProxyOverhead: sourceFlags =>
        [SOURCE_FLAGS.Uniswap_V2, SOURCE_FLAGS.SushiSwap].includes(sourceFlags)
            ? new BigNumber(21e3) : new BigNumber(150e3),
    rfqt: { makerEndpointMaxResponseTimeMs: 600 },
};

const INTERMEDIATE_TOKENS = ['WETH','DAI','USDC','WBTC'];

// Check that all sources are handled.
(() => {
    const getUnusedSources = schedule => Object
        .values(ERC20BridgeSource)
        .filter(s => !Object.keys(schedule).includes(s));
    let unused = getUnusedSources(FEE_SCHEDULE);
    assert(unused.length === 0, `Sources missing from fee schedule: ${unused}`);
    unused = getUnusedSources(GAS_SCHEDULE);
    assert(unused.length === 0, `Sources missing from gas schedule: ${unused}`);
})();

module.exports = {
    GAS_SCHEDULE,
    FEE_SCHEDULE,
    SRA_API_URL,
    PROTOCOL_FEE,
    DEFAULT_MARKET_OPTS,
    INTERMEDIATE_TOKENS,
    GAS_STATION_URL,
};
