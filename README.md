# yenombot

## prepare env
```
npm install
touch ./src/token.js
```

``` javascript
export default {
    botToken: {
        dev: '//TODO: go to @botfather',
        prod: '//TODO: go to @botfather'
    },
    developers: [
        //TODO: paste your telegram id here
    ],
    
    //init tokens data block
    initData: {
        ['some-fucking-init-token']: {
            balanceInit: 666,  //TODO: monthly limitÏ
            paymentGroups: [{
                title: 'Cat 1',
                id: '1'
            }, {
                title: 'Cat 2',
                id: '2'
            }]
        }
    }
     
}
```