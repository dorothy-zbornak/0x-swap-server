'use strict'
require('colors');
const Web3 = require('web3');
const { SwapQuoter } = require('@0x/asset-swapper');
const { Orderbook } = require('@0x/orderbook');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const _ = require('lodash');
const fs = require('fs');

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
    .option('pool', { alias: 'l', type: 'string' })
    .option('runLimit', { alias: 'r', type: 'number', default: 2 ** 8 })
    .option('samples', { alias: 's', type: 'number', default: 13 })
    .option('dist', { alias: 'd', type: 'number', default: 1.05 })
    .option('rfqt-config', { alias: 'R', type: 'string' })
    .argv;

const RFQT_OPTS = ARGV.rfqtConfig ? JSON.parse(fs.readFileSync(ARGV.rfqtConfig)) : {};

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
    rfqt: {
        apiKey: RFQT_OPTS.apiKey,
        makerEndpointMaxResponseTimeMs: 600,
    },
};
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    liquidityProviderRegistryAddress: ARGV.pool,
    expiryBufferMs: 60 * 1000,
    contractAddresses: addresses,
    rfqt: {
        takerApiKeyWhitelist: RFQT_OPTS.apiKey ? [RFQT_OPTS.apiKey] : [],
        makerAssetOfferings: RFQT_OPTS.offerings || [],
        infoLogger: () => {},
    },
};

(async() => {
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
    return _.merge({}, ...opts);
}

function createQuoter(provider, orderbook) {
    const swapQuoter = new SwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = mergeOpts(
            DEFAULT_MARKET_OPTS,
            opts,
            { rfqt: { takerAddress: opts.takerAddress, isIndicative: !!opts.takerAddress } },
        );
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
