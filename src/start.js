'use strict'
require('colors');
const Web3 = require('web3');
const { ERC20BridgeSource, SwapQuoter: ProdSwapQuoter } = require('@0x/asset-swapper');
const { SwapQuoter: DevSwapQuoter } = require('@0x/asset-swapper-dev');
const { Orderbook } = require('@0x/orderbook-dev');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const { Server } = require('./server');

const ARGV = yargs
    .number('port').default('port', 7001)
    .boolean('fallback').default('fallback', true)
    .string('pool')
    .argv;

const SRA_API_URL = 'https://api.0x.org/sra';
const GAS_SCHEDULE = {
    [ERC20BridgeSource.Native]: 1.5e5,
    [ERC20BridgeSource.Uniswap]: 3e5,
    [ERC20BridgeSource.LiquidityProvider]: 3e5,
    [ERC20BridgeSource.Eth2Dai]: 5.5e5,
    [ERC20BridgeSource.Kyber]: 8e5,
    [ERC20BridgeSource.CurveUsdcDai]: 9e5,
    [ERC20BridgeSource.CurveUsdcDaiUsdt]: 9e5,
    [ERC20BridgeSource.CurveUsdcDaiUsdtTusd]: 10e5,
    [ERC20BridgeSource.CurveUsdcDaiUsdtBusd]: 10e5,
    [ERC20BridgeSource.CurveUsdcDaiUsdtSusd]: 6e5,
};
const FEE_SCHEDULE = Object.assign(
    {},
    ...Object.keys(GAS_SCHEDULE).map(k => ({
        [k]: new BigNumber(GAS_SCHEDULE[k] + 1.5e5),
    })),
);
const DEFAULT_MARKET_OPTS = {
    excludedSources: [],
    runLimit: 2 ** 15,
    bridgeSlippage: 0.01,
    maxFallbackSlippage: 0.015,
    numSamples: 13,
    sampleDistributionBase: 1.05,
    feeSchedule: FEE_SCHEDULE,
    gasSchedule: GAS_SCHEDULE,
    allowFallback: !!ARGV.fallback,
};
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    liquidityProviderRegistryAddress: ARGV.pool,
    expiryBufferMs: 90 * 1000,
};

(async() => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const server = new Server(provider);
    server.addQuoteEndpoint('/swap/prod/quote', createProductionQuoter(provider, orderbook));
    server.addQuoteEndpoint('/swap/dev/quote', createDevelopmentQuoter(provider, orderbook));
    await server.listen(ARGV.port);
    console.log(`${'*'.bold} Listening on port ${ARGV.port.toString().bold.green}...`);
})();

function createOrderbook(sraApiUrl) {
    return Orderbook.getOrderbookForPollingProvider({
        httpEndpoint: sraApiUrl,
        pollingIntervalMs: 10000,
        perPage: 1000,
    });
}

function createZeroExProvider(rpcHost) {
    let provider;
    if (/^ws:\/\//.test(rpcHost)) {
        provider = new Web3.providers.WebsocketProvider(rpcHost);
    } else if (/^https?:\/\//.test(rpcHost)) {
        provider = new Web3.providers.HttpProvider(rpcHost);
    }
    return {
        sendAsync: (payload, callback) => provider.send(payload, (err, r) => callback(err || null, r)),
    };
}

function mergeOpts(...opts) {
    const r = {};
    for (const o of opts) {
        for (const k in o) {
            if (o[k] !== undefined) {
                r[k] = o[k];
            }
        }
    }
    return r;
}

function createProductionQuoter(provider, orderbook) {
    const swapQuoter = new ProdSwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`prod: ${JSON.stringify(opts)}`);
        const marketOpts = mergeOpts(DEFAULT_MARKET_OPTS, opts);
        if (opts.buyAmount) {
            return swapQuoter.getMarketBuySwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                marketOpts,
            );
        }
        return swapQuoter.getMarketSellSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            marketOpts,
        );
    };
}

function createDevelopmentQuoter(provider, orderbook) {
    const swapQuoter = new DevSwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = mergeOpts(DEFAULT_MARKET_OPTS, opts);
        if (opts.buyAmount) {
            return swapQuoter.getMarketBuySwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                marketOpts,
            );
        }
        return swapQuoter.getMarketSellSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            marketOpts,
        );
    };
}
