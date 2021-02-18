'use strict'
const { ERC20BridgeSource, SwapQuoteConsumer } = require('@0x/asset-swapper');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');
const { FillQuoteTransformerOrderType } = require('@0x/protocol-utils');
const BigNumber = require('bignumber.js');
const express = require('express');
const TOKENS = require('./tokens');

class Server {
    constructor(provider, addresses) {
        this._addresses = addresses || getContractAddressesForChainOrThrow(1);
        this._app = express();
        this._app.use(express.json());
        this._quoteConsumer = new SwapQuoteConsumer(
            provider,
            {
                chainId: 1,
                contractAddresses: this._addresses,
            },
        );
    }

    addQuoteEndpoint(endpoint, quoter, opts = {}) {
        this._app.get(
            endpoint,
            async (req, res) => {
                const quoterOpts = createQuoterOpts(req.query);
                try {
                    const quote = await quoter(quoterOpts);
                    const {
                        calldataHexString: callData,
                        toAddress,
                        ethAmount,
                    } = await this._quoteConsumer.getCalldataOrThrowAsync(
                        quote,
                        {
                            useExtensionContract: 'EXCHANGE_PROXY',
                            extensionContractOpts: {
                                isFromETH: req.query.sellToken === 'ETH',
                                isToETH: req.query.buyToken === 'ETH',
                            },
                        },
                    );
                    res.json({
                        allowanceTarget: this._addresses.exchangeProxy,
                        price: getPrice(
                            quoterOpts.buyAmount ? 'buy' : 'sell',
                            quoterOpts.buyToken,
                            quoterOpts.sellToken,
                            quote.bestCaseQuoteInfo,
                        ),
                        to: toAddress,
                        value: adjustQuoteEthValue(
                            quote,
                            req.query.sellToken === 'ETH'
                                ? quote.worstCaseQuoteInfo.totalTakerAmount
                                : 0,
                        ),
                        data: callData,
                        gas: quote.worstCaseQuoteInfo.gas || 0,
                        gasPrice: quote.gasPrice,
                        orders: serializeOrdersToOutput(quote.orders),
                        buyAmount: quote.bestCaseQuoteInfo.makerAmount,
                        sellAmount: quote.bestCaseQuoteInfo.totalTakerAmount,
                        protocolFee: getQuoteProtocolFee(quote),
                        buyTokenAddress: quoterOpts.buyTokenAddress,
                        sellTokenAddress: quoterOpts.sellTokenAddress,
                        maxSellAmount: quote.worstCaseQuoteInfo.totalTakerAmount,
                    });
                } catch (err) {
                    console.error(err);
                    res.status(500);
                    res.json({ 'error': err.toString(), stack: JSON.stringify(err.stack) });
                }
            },
        );
    }

    async listen(port) {
        return new Promise((accept, reject) => {
            this._app.listen(
                port,
                (err) => {
                    if (err) {
                        return reject(err);
                    }
                    accept();
                },
            );
        });
    }
}

function adjustQuoteEthValue(quote, ethSellAmount, isV0) {
    if (isV0) {
        return quote.value;
    }
    const FEE_PER_ORDER = quote.gasPrice.times(70e3);
    const numNativeOrders = quote.orders.filter(o => o.fills[0].source === ERC20BridgeSource.Native).length;
    return FEE_PER_ORDER.times(numNativeOrders).plus(ethSellAmount);
}

function getQuoteProtocolFee(quote) {
    const feePerOrder = quote.worstCaseQuoteInfo.protocolFeeInWeiAmount.div(quote.orders.length);
    // Only native orders have protocol fees.
    const nativeOrders = quote.orders.filter(o => o.fills[0].source === ERC20BridgeSource.Native);
    return feePerOrder.times(nativeOrders.length);
}

function createQuoterOpts(query) {
    let { buyToken, sellToken, buyAmount, sellAmount } = query;
    if (!buyAmount && !sellAmount) {
        throw new Error('No buy or sell a mount specified');
    }
    return {
        buyToken: getTokenSymbol(buyToken),
        sellToken: getTokenSymbol(sellToken),
        buyTokenAddress: buyToken === 'ETH' ? TOKENS.WETH.address : getToken(buyToken).address,
        sellTokenAddress: sellToken === 'ETH' ? TOKENS.WETH.address : getToken(sellToken).address,
        buyAmount: buyAmount !== undefined ? new BigNumber(buyAmount) : undefined,
        sellAmount: sellAmount !== undefined ? new BigNumber(sellAmount) : undefined,
        bridgeSlippage: query.bridgeSlippage !== undefined ? parseFloat(query.bridgeSlippage) : undefined,
        maxFallbackSlippage: query.maxFallbackSlippage !== undefined ? parseFloat(query.maxFallbackSlippage) : undefined,
        gasPrice: query.gasPrice !== undefined ? new BigNumber(query.gasPrice) : undefined,
        numSamples: query.numSamples !== undefined ? parseInt(query.numSamples) : undefined,
        runLimit: query.runLimit !== undefined ? parseInt(query.runLimit) : undefined,
        excludedSources: (query.excludedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
        includedSources: (query.includedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
        takerAddress: query.takerAddress,
    };
}

function getToken(symbolOrAddress) {
    if (symbolOrAddress.startsWith('0x')) {
        return Object.values(TOKENS).filter(t => t.address.toLowerCase() === symbolOrAddress.toLowerCase())[0];
    }
    return TOKENS[symbolOrAddress];
}

function getTokenSymbol(symbolOrAddress) {
    if (symbolOrAddress.startsWith('0x')) {
        return Object.keys(TOKENS).filter((s) => TOKENS[s].address.toLowerCase() === symbolOrAddress.toLowerCase())[0];
    }
    return symbolOrAddress;
}

function getPrice(side, buyToken, sellToken, quoteInfo) {
    const buyDecimals = getToken(buyToken).decimals;
    const sellDecimals = getToken(sellToken).decimals;
    const price = quoteInfo.makerAmount.div(`1e${buyDecimals}`)
        .div(quoteInfo.totalTakerAmount.div(`1e${sellDecimals}`));
    return side === 'sell' ? price : price.pow(-1);
}

function serializeOrdersToOutput(orders) {
    return orders.map(o => Object.assign({}, o, { fills: undefined }));
}

module.exports = {
    Server,
};
