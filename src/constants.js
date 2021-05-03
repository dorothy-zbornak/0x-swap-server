'use strict'
const BigNumber = require('bignumber.js');

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const GAS_STATION_URL = 'http://gas.api.0x.org/source/median?output=eth_gas_station';
const SRA_API_URL = 'https://api.0x.org/sra';
const TX_BASE_GAS = new BigNumber(21e3);

const EMPTY_SECRETS = {
    liquidityProviderRegistryByChainId: {},
    rfqt: { validApiKeys: [], offeringsByChainId: {} },
};

module.exports = {
    EMPTY_SECRETS,
    SRA_API_URL,
    GAS_STATION_URL,
    NULL_ADDRESS,
    TX_BASE_GAS,
};
