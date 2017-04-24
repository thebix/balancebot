import _token from './token'

import { l } from './logger'

import {
    BOT_CMD,
    BOT_CMD_CLEAR,

    BALANCE_INIT,
    BALANCE_CHANGE
} from './actions'

const defaultState = {
    command: {
        ['84677480']: ''
    },
    balance: {
        ['84677480']: {
            balance: _token.balanceInit,
            period: ''
        }
    }
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

const balance = (state = defaultState.balance, action) => {
    switch (action.type) {
        case BALANCE_INIT: {
            return {
                period: action.period,
                balance: _token.balanceInit
            }
        }
        case BALANCE_CHANGE:
            const balance = Object.keys(state).some(x => x == action.chatId)
                ? state[action.chatId].balance - action.sub
                : _token.balanceInit - action.sub
            return Object.assign({}, state, {
                [action.chatId]: {
                    period: action.period,
                    balance
                }
            })
    }
    return state
}

export default (state, action) => {
    return {
        command: command(state.command, action),
        balance: balance(state.balance, action)
    }
}