'use strict'
require('colors');
const Web3 = require('web3');
const { ERC20BridgeSource, SwapQuoter } = require('@0x/asset-swapper');
const { Orderbook } = require('@0x/orderbook');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const _ = require('lodash');
const fs = require('fs');

const TOKENS = require('./tokens');
const { addresses } = require('./addresses');
const {
    FEE_SCHEDULE_V1,
    GAS_SCHEDULE_V1
} = require('./schedules');

const ARGV = yargs
    .option('pool', { alias: 'l', type: 'string' })
    .option('rfqt-config', { alias: 'R', type: 'string' })
    .argv;

const RFQT_OPTS = ARGV.rfqtConfig ? JSON.parse(fs.readFileSync(ARGV.rfqtConfig)) : {};

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
    feeSchedule: FEE_SCHEDULE_V1,
    gasSchedule: GAS_SCHEDULE_V1,
    shouldBatchBridgeOrders: false,
    rfqt: {
        apiKey: RFQT_OPTS.apiKey,
        makerEndpointMaxResponseTimeMs: 600,
        // nativeExclusivelyRFQT: true,
        takerAddress: addresses.exchangeProxyFlashWallet,
        intentOnFilling: true,
    },
};
const INTERMEDIATE_TOKENS = ['WETH','DAI','USDC','WBTC'];
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    liquidityProviderRegistryAddress: ARGV.pool,
    expiryBufferMs: 60 * 1000,
    contractAddresses: addresses,
    rfqt: {
        takerApiKeyWhitelist: RFQT_OPTS.apiKey ? [RFQT_OPTS.apiKey] : [],
        makerAssetOfferings: RFQT_OPTS.offerings || [],
    },
    tokenAdjacencyGraph: Object.assign(
        ...Object.values(TOKENS).map(
            t => ({
                [t.address]: INTERMEDIATE_TOKENS
                    .filter(s => TOKENS[s].address !== t.address)
                    .map(s => TOKENS[s].address)
            }),
        ),
    ),
};

const FEE_STOPS = [50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500];
const GAS_STOPS = [10, 50, 100, 150, 200, 300, 400, 500];
const SIZE_STOPS = [100, 500, 1e3, 10e3, 25e3, 50e3, 100e3, 250e3];
const SAMPLE_PAIRS = ['WETH/DAI', 'WETH/USDC'];
const TOKEN_PRICES = {WETH: 364, DAI: 1.01, USDC: 1};

(async() => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const swapQuoter = new SwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );

    let resultsBuffer = [];
    while (true) {
        const [makerToken, takerToken] = _.shuffle(_.sample(SAMPLE_PAIRS).split('/'));
        const gasPrice = Math.round(sampleStops(GAS_STOPS));
        const fee = Math.round(sampleStops(FEE_STOPS));
        const size = sampleStops(SIZE_STOPS);
        const sellAmount = new BigNumber(size)
            .div(TOKEN_PRICES[takerToken])
            .times(`1e${TOKENS[takerToken].decimals}`)
            .integerValue();
        console.log(gasPrice, fee, size, sellAmount.toString(10));
        let quote;
        try {
            quote = await swapQuoter.getMarketSellSwapQuoteAsync(
                TOKENS[makerToken].address,
                TOKENS[takerToken].address,
                sellAmount,
                {
                    ...DEFAULT_MARKET_OPTS,
                    gasPrice: new BigNumber(gasPrice).times('1e9').integerValue(),
                    feeSchedule: {
                        ...DEFAULT_MARKET_OPTS.feeSchedule,
                        [ERC20BridgeSource.Native]: () => fee * 1e3,
                    },
                }
            );
        } catch (err) {
            console.error(`${takerToken}->${makerToken} $${size} @ ${gasPrice}: ${err.message}`);
            await sleep(3);
            continue;
        }
        const rfqtVolume = BigNumber.min(
            BigNumber.sum(
                0,
                ...quote.orders
                    .filter(
                        o => o.takerAddress.toLowerCase() === addresses.exchangeProxyFlashWallet.toLowerCase(),
                    ).map(o => o.takerAssetAmount),
                ).div(`1e${TOKENS[takerToken].decimals}`).times(TOKEN_PRICES[takerToken]),
            size,
        ).toNumber();
        const result = {
            makerToken,
            takerToken,
            size,
            fee,
            gasPrice,
            rfqtVolume,
            sources: Object.keys(quote.sourceBreakdown),
        };
        console.info(result);
        resultsBuffer.push(result);
        if (resultsBuffer.length >= 3) {
            await writeResults(resultsBuffer);
            resultsBuffer = [];
        }
        await sleep(5);
    }
})();

function sleep(secs) {
    return new Promise((accept) => {
        setTimeout(() => accept(), secs * 1000);
    });
}

async function writeResults(buf) {
    await fs.promises.appendFile('pf_tests.json', buf.map(b => JSON.stringify(b)).join('\n') + '\n', 'utf-8');
    console.info(`wrote ${buf.length} results to disk`);
}

function sampleStops(stops) {
    const sizeIdx = _.random(stops.length - 2);
    return _.random(stops[sizeIdx], stops[sizeIdx+1], true);
}

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
