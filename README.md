# 0x-swap-server
Run a minimal swap/quote endpoint for A-B testing different versions of asset-swapper.

## Setup
If you're actively developing on asset-swapper, you will need to `yarn link` it from the repo into this project.
Depending on the scope of your development, you may have to link other packages.
```bash
$ cd $PROTOCOL_REPO_ROOT/packages/asset-swapper && yarn link
$ cd $SWAP_SERVER_ROOT && yarn link '@0x/asset-swapper'
```

You can also edit `src/start.js` to configure the swap-server (it might not always reflect the config on production).

## Running
```bash
NODE_RPC=YOUR_NODE_RPC yarn start [-S SECRETS_FILE]
```

### Options

| option | description |
|--------|-------------|
| `--pool` | The address of the liqudity provider registry contract |
| `--port | -p` | The port to run on |
| `--secrets | -S` | secrets config file (see below) |

## Secrets file
To unlock RFQT and liquidity provider access requests need to pass the `0x-api-key` header in requests AND you need to create a `secrets.json` file in the root of the project. This file has the following shape:

```js
{
    "liquidityProviderRegistry": {
        [lpAddress]: {
            "tokens": [...TOKEN_ADDRESSES],
            "gasCost": GAS_COST,
        },
        ...
    },
    "rfqt": {
        "validApiKeys": [...VALID_API_KEYS],
        "offeringsByChainId": {
            [CHAIN_ID_AS_STRING]: {
                [RFQT_ENDPOINT]: [[TOKEN_A, TOKEN_B], ...],
            },
            ...
        }
    }
}
```

All this stuff can be pulled from the infra configs.
