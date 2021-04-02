'use strict'
require('colors');
const Web3 = require('web3');
const { SwapQuoter, MarketOperation, OrderPrunerPermittedFeeTypes } = require('@0x/asset-swapper');
const { Orderbook } = require('@0x/orderbook');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const _ = require('lodash');
const fs = require('fs');

const { Server } = require('./server');
const {
    DEFAULT_MARKET_OPTS,
    GAS_STATION_URL,
    SRA_API_URL,
    NULL_ADDRESS,
} = require('./constants');

const ARGV = yargs
    .option('chainId', { alias: 'c', type: 'number', default: 1})
    .option('port', { alias: 'p', type: 'number', default: 7001 })
    .option('runLimit', { alias: 'r', type: 'number', default: 2 ** 8 })
    .option('samples', { alias: 's', type: 'number', default: 13 })
    .option('dist', { alias: 'd', type: 'number', default: 1.05 })
    .option('secrets', { alias: 'S', type: 'string' })
    .argv;

const CHAIN_CONFIG = require('./chain-configs')[ARGV.chainId];
const SECRETS = ARGV.secrets ? JSON.parse(fs.readFileSync(ARGV.secrets)) : {};
const SWAP_QUOTER_OPTS = {
    chainId: ARGV.chainId,
    liquidityProviderRegistry: SECRETS.liquidityProviderRegistry || {},
    expiryBufferMs: 60 * 1000,
    ethGasStationUrl: GAS_STATION_URL,
    rfqt: {
        takerApiKeyWhitelist: SECRETS.rfqt.validApiKeys ? SECRETS.rfqt.validApiKeys : [],
        makerAssetOfferings: (SECRETS.rfqt.offeringsByChainId || {})[ARGV.chainId] || {},
        infoLogger: () => {},
    },
    tokenAdjacencyGraph: {
        default: CHAIN_CONFIG.intermediateTokens.map(t => CHAIN_CONFIG.tokens[t].address),
    },
    permittedOrderFeeTypes: new Set([OrderPrunerPermittedFeeTypes.NoFees]),
};

(async() => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const server = new Server(provider, ARGV.chainId);
    server.addQuoteEndpoint('/swap/dev/quote', createQuoter(provider, orderbook), { v0: ARGV.v0 });
    await server.listen(ARGV.port);
    console.log(`${'*'.bold} Listening on port ${ARGV.port.toString().bold.green}...`);
})();

function createOrderbook(sraApiUrl) {
    // TODO: enable orderbook for OO orders.
    return {
        getOrdersAsync() { return []; },
        getBatchOrdersAsync() { return []; },
        destroyAsync() {},
    };
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

function createQuoter(provider, orderbook) {
    const swapQuoter = new SwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = _.merge(
            {},
            DEFAULT_MARKET_OPTS,
            {
                runLimit: ARGV.runLimit,
                samples: ARGV.samples,
                sampleDistributionBase: ARGV.dist,
            },
            opts,
            {
                ...(opts.takerAddress && opts.apiKey
                    ? {
                        rfqt : {
                            apiKey: opts.apiKey,
                            takerAddress: NULL_ADDRESS,
                            txOrigin: opts.takerAddress,
                            intentOnFilling: true,
                        }
                    } : {}),
            },
        );
        if (opts.buyAmount) {
            return swapQuoter.getSwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                MarketOperation.Buy,
                marketOpts,
            );
        }
        return swapQuoter.getSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            MarketOperation.Sell,
            marketOpts,
        );
    };
}
