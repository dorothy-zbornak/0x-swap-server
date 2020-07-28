'use strict'
const { ERC20BridgeSource } = require('@0x/asset-swapper');
const BigNumber = require('bignumber.js');

const PROTOCOL_FEE = 70e3;
const GAS_SCHEDULE_V0 = {
    [ERC20BridgeSource.Native]: () => 1.5e5,
    [ERC20BridgeSource.Uniswap]: () => 3e5,
    [ERC20BridgeSource.LiquidityProvider]: () => 3e5,
    [ERC20BridgeSource.Eth2Dai]: () => 5.5e5,
    [ERC20BridgeSource.Kyber]: () => 8e5,
    [ERC20BridgeSource.Curve]: fillData => {
        switch (fillData.curve.poolAddress.toLowerCase()) {
            case '0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56':
            case '0x52ea46506b9cc5ef470c5bf89f17dc28bb35d85c':
                return 9e5;
            case '0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51':
            case '0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27':
                return 10e5;
            case '0xa5407eae9ba41422680e2e00537571bcc53efbfd':
            case '0x93054188d876f558f4a66b2ef1d97d16edf0895b':
            case '0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714':
                return 6e5;
            default:
                throw new Error('Unrecognized Curve address');
        }
    },
    [ERC20BridgeSource.MultiBridge]: () => 6.5e5,
    [ERC20BridgeSource.UniswapV2]: fillData => {
        let gas = 3e5;
        if (fillData.tokenAddressPath.length > 2) {
            gas += 5e4;
        }
        return gas;
    },
    [ERC20BridgeSource.Balancer]: () => 4.5e5,
};

const FEE_SCHEDULE_V0 = Object.assign(
    {},
    ...Object.keys(GAS_SCHEDULE_V0).map(k => ({
        [k]: fillData => new BigNumber(PROTOCOL_FEE).plus(GAS_SCHEDULE_V0[k](fillData)),
    })),
);

const GAS_SCHEDULE_V1 = {
    ...GAS_SCHEDULE_V0,
};

const FEE_SCHEDULE_V1 = Object.assign(
    {},
    ...Object.keys(GAS_SCHEDULE_V0).map(k => ({
        [k]:
            k === ERC20BridgeSource.Native
                ? fillData => new BigNumber(PROTOCOL_FEE).plus(GAS_SCHEDULE_V1[k](fillData))
                : fillData => GAS_SCHEDULE_V1[k](fillData),
    })),
);

module.exports = {
    GAS_SCHEDULE_V0,
    FEE_SCHEDULE_V0,
    GAS_SCHEDULE_V1,
    FEE_SCHEDULE_V1,
};
