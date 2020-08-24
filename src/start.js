'use strict';
require('colors');
const Web3 = require('web3');
const { SwapQuoter } = require('@0x/asset-swapper');
const { Orderbook } = require('@0x/orderbook');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const { Server } = require('./server');
const { addresses } = require('./addresses');
const {
    FEE_SCHEDULE_V0,
    FEE_SCHEDULE_V1,
    GAS_SCHEDULE_V0,
    GAS_SCHEDULE_V1
} = require('./schedules');

const ARGV = yargs
    .option('port', { alias: 'p', type: 'number', default: 7001 })
    .option('v0', { type: 'boolean' })
    .option('pool', { type: 'string' })
    .option('runLimit', { alias: 'r', type: 'number', default: 2 ** 8 })
    .option('samples', { alias: 's', type: 'number', default: 13 })
    .option('dist', { alias: 'd', type: 'number', default: 1.05 })
    .argv;

const SRA_API_URL = 'https://api.0x.org/sra';
const DEFAULT_MARKET_OPTS = {
    excludedSources: [],
    runLimit: ARGV.runLimit,
    bridgeSlippage: 0.01,
    maxFallbackSlippage: 0.015,
    numSamples: ARGV.samples,
    sampleDistributionBase: ARGV.dist,
    allowFallback: true,
    feeSchedule: ARGV.v0 ? FEE_SCHEDULE_V0 : FEE_SCHEDULE_V1,
    gasSchedule: ARGV.v0 ? GAS_SCHEDULE_V0 : FEE_SCHEDULE_V1,
    shouldBatchBridgeOrders: ARGV.v0 ? true : false,
};
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    liquidityProviderRegistryAddress: ARGV.pool,
    expiryBufferMs: 60 * 1000,
    contractAddresses: addresses,
};
const TOKEN_ADJACENCY_GRAPH = {
    // renBTC: wBTC
    '0xeb4c2781e4eba804ce9a9803c67d0893436bb27d': ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
    // TUSD: USDC, DAI
    '0x0000000000085d4780B73119b644AE5ecd22b376': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x6b175474e89094c44da98b954eedeac495271d0f'],
    // USDT: USDC, DAI
    '0xdac17f958d2ee523a2206206994597c13d831ec7': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x6b175474e89094c44da98b954eedeac495271d0f'],
    // COMP: USDC
    '0xc00e94cb662c3520282e6f5717214004a7f26888': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
    // LEND: USDC
    '0x80fB784B7eD66730e8b1DBd9820aFD29931aab03': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
    // SNX: USDC
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
};

(async () => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const server = new Server(provider, addresses);
    server.addQuoteEndpoint('/swap/dev/quote', createQuoter(provider, orderbook), { v0: ARGV.v0 });
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

function createQuoter(provider, orderbook) {
    const swapQuoter = new SwapQuoter(
        provider,
        orderbook,
        {
            ...SWAP_QUOTER_OPTS,
            tokenAdjacencyGraph: TOKEN_ADJACENCY_GRAPH,
        },
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
