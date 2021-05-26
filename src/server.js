'use strict'
const { ERC20BridgeSource, SwapQuoteConsumer } = require('@0x/asset-swapper');
const { FillQuoteTransformerOrderType } = require('@0x/protocol-utils');
const BigNumber = require('bignumber.js');
const express = require('express');
const cors = require('cors');

class Server {
    constructor(chainConfig) {
        this._chainId = chainConfig.chainId;
        this._chainConfig = chainConfig;
        this._app = express();
        this._app.use(cors());
        this._app.use(express.json());
        this._quoteConsumer = new SwapQuoteConsumer(
            {
                chainId: this._chainId,
                contractAddresses: this._chainConfig.addresses,
            },
        );
    }

    addQuoteEndpoint(endpoint, quoter, opts = {}) {
        this._app.get(
            endpoint,
            async (req, res) => {
                const quoterOpts = this._createQuoterOpts(req);
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
                                isFromETH: req.query.sellToken === this._chainConfig.gasTokenSymbol,
                                isToETH: req.query.buyToken === this._chainConfig.gasTokenSymbol,
                            },
                        },
                    );
                    res.json({
                        allowanceTarget: this._chainConfig.addresses.exchangeProxy,
                        price: this._getPrice(
                            quoterOpts.buyAmount ? 'buy' : 'sell',
                            quoterOpts.buyToken,
                            quoterOpts.sellToken,
                            quote.bestCaseQuoteInfo,
                            this._chainId,
                        ),
                        to: toAddress,
                        value: ethAmount,
                        data: callData,
                        gas: quote.worstCaseQuoteInfo.gas || 0,
                        gasPrice: quote.gasPrice,
                        sources: Object.entries(quote.sourceBreakdown)
                            .map(([name, proportion]) => ({ name, proportion })),
                        orders: serializeOrdersToOutput(quote.orders),
                        protocolFee: '0', // TODO
                        buyAmount: quote.bestCaseQuoteInfo.makerAmount.toString(10),
                        sellAmount: quote.bestCaseQuoteInfo.totalTakerAmount.toString(10),
                        buyTokenAddress: quoterOpts.buyTokenAddress,
                        sellTokenAddress: quoterOpts.sellTokenAddress,
                        maxSellAmount: BigNumber.max(
                            quote.bestCaseQuoteInfo.totalTakerAmount,
                            quote.worstCaseQuoteInfo.totalTakerAmount
                        ).toString(10),
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

    _createQuoterOpts(req) {
        const query = req.query;
        let { buyToken, sellToken, buyAmount, sellAmount, gasPrice } = query;
        if (!buyAmount && !sellAmount) {
            throw new Error('No buy or sell a mount specified');
        }
        if (Array.isArray(gasPrice)) {
            gasPrice = gasPrice[gasPrice.length - 1];
        }
        return {
            apiKey: req.header('0x-api-key'),
            buyToken: this._getTokenSymbol(buyToken),
            sellToken: this._getTokenSymbol(sellToken),
            buyTokenAddress: buyToken === this._chainConfig.gasTokenSymbol
                ? this._chainConfig.tokens[this._chainConfig.wrappedGasTokenSymbol].address
                : this._getToken(buyToken).address,
            sellTokenAddress: sellToken === this._chainConfig.gasTokenSymbol
                ? this._chainConfig.tokens[this._chainConfig.wrappedGasTokenSymbol].address
                : this._getToken(sellToken).address,
            buyAmount: buyAmount !== undefined ? new BigNumber(buyAmount) : undefined,
            sellAmount: sellAmount !== undefined ? new BigNumber(sellAmount) : undefined,
            bridgeSlippage: query.bridgeSlippage !== undefined ? parseFloat(query.bridgeSlippage) : undefined,
            maxFallbackSlippage: query.maxFallbackSlippage !== undefined ? parseFloat(query.maxFallbackSlippage) : undefined,
            gasPrice: gasPrice !== undefined ? new BigNumber(gasPrice) : undefined,
            numSamples: query.numSamples !== undefined ? parseInt(query.numSamples) : undefined,
            runLimit: query.runLimit !== undefined ? parseInt(query.runLimit) : undefined,
            excludedSources: (query.excludedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
            includedSources: (query.includedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
            takerAddress: query.takerAddress,
            block: query.block ? parseInt(query.block) : undefined,
        };
    }

    _getToken(symbolOrAddress) {
        if (symbolOrAddress.startsWith('0x')) {
            return Object.values(this._chainConfig.tokens)
                    .filter(t => t.address.toLowerCase() === symbolOrAddress.toLowerCase() )[0];
        }
        return this._chainConfig.tokens[symbolOrAddress];
    }

    _getTokenSymbol(symbolOrAddress) {
        if (symbolOrAddress.startsWith('0x')) {
            return Object.keys(this._chainConfig.tokens)
                .filter((s) => this._chainConfig.tokens[s].address.toLowerCase() === symbolOrAddress.toLowerCase())[0];
        }
        return symbolOrAddress;
    }

    _getPrice(side, buyToken, sellToken, quoteInfo) {
        const buyDecimals = this._chainId === 56 ? 18 : this._getToken(buyToken).decimals;
        const sellDecimals = this._chainId === 56 ? 18 : this._getToken(sellToken).decimals;
        const price = quoteInfo.makerAmount.div(`1e${buyDecimals}`)
            .div(quoteInfo.totalTakerAmount.div(`1e${sellDecimals}`));
        return side === 'sell' ? price : price.pow(-1);
    }
}

function serializeOrdersToOutput(orders) {
    return orders.map(o => Object.assign({}, o, { fills: undefined }));
}

module.exports = {
    Server,
};
