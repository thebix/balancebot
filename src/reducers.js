import _token from './token'

import { l } from './logger'

import {
    BOT_CMD,
    BOT_CMD_CLEAR,
    BOT_BALANCE_MESSAGE_ID,

    INIT_BY_TOKEN,

    BALANCE_INIT,
    BALANCE_CHANGE,

    USER_ADD
} from './actions'

const defaultState = {
    command: {},
    balance: {},
    balanceInit: {},
    paymentGroups: {},
    users: {},
    botBalanceMessageId: {}
}

const command = (state = defaultState.command, action) => {
    switch (action.type) {
        case BOT_CMD:
            return Object.assign({}, state, {
                [action.chatId]: action.command
            })
        case BOT_CMD_CLEAR:
            return Object.assign({}, state, {
                [action.chatId]: ''
            })
    }
    return state
}

const balance = (state = defaultState.balance, action, balanceInit = state.balanceInit) => {
    const initBalance = balanceInit ? balanceInit[action.chatId] || 0 : 0
    switch (action.type) {
        case BALANCE_INIT: {
            return Object.assign({}, state, {
                [action.chatId]: {
                    period: action.period,
                    balance: initBalance
                }
            })
        }
        case BALANCE_CHANGE:
            const balance = Object.keys(state).some(x => x == action.chatId)
                ? state[action.chatId].balance - action.sub
                : initBalance - action.sub
            return Object.assign({}, state, {
                [action.chatId]: {
                    period: action.period,
                    balance
                }
            })
    }
    return state
}

const paymentGroups = (state = defaultState.paymentGroups, action) => {
    switch (action.type) {
        case INIT_BY_TOKEN:
            if (action.token
                && _token.initData
                && _token.initData[action.token]
                && _token.initData[action.token].paymentGroups
                && _token.initData[action.token].paymentGroups.length > 0)
                return Object.assign({}, state, {
                    [action.chatId]: _token.initData[action.token].paymentGroups
                })

    }
    return state
}

const balanceInit = (state = defaultState.balanceInit, action) => {
    switch (action.type) {
        case INIT_BY_TOKEN:
            if (action.token
                && _token.initData
                && _token.initData[action.token]
                && _token.initData[action.token].balanceInit)
                return Object.assign({}, state, {
                    [action.chatId]: _token.initData[action.token].balanceInit
                })

    }
    return state
}

const users = (state = defaultState.users, action) => {
    switch (action.type) {
        case USER_ADD:
            return Object.assign({}, state, {
                [action.id]: {
                    firstName: action.firstName,
                    lastName: action.lastName,
                    username: action.username,
                    id: action.id
                }
            })
    }
    return state
}

const botBalanceMessageId = (state = defaultState.botBalanceMessageId, action) => {
    switch (action.type) {
        case BOT_BALANCE_MESSAGE_ID:
            return Object.assign({}, state, {
                [action.chatId]: action.messageId
            })
    }
    return state
}

export default (state, action) => {
    return {
        command: command(state.command, action),
        balance: balance(state.balance, action, state.balanceInit),
        paymentGroups: paymentGroups(state.paymentGroups, action),
        balanceInit: balanceInit(state.balanceInit, action),
        users: users(state.users, action),
        botBalanceMessageId: botBalanceMessageId(state.botBalanceMessageId, action)
    }
}