import { createStore, compose, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import FileSystem from './lib/filesystem'
import History from './lib/history'
import Message from './lib/message'

import { l, log, logLevel } from './logger'
import _config from './config'
import _commands from './enums/commands'
import lib from './lib/index'

import Timer from './lib/timer'
import appReducer from './reducers'
import Telegram from './lib/telegram'

log('Start bot', logLevel.INFO)

const enhancer = compose(
    applyMiddleware(thunkMiddleware)
)
export let store = null
export const history = new History(_config.dirStorage, 'balance-hist-${id}.json')

if (FileSystem.isDirExists(_config.dirStorage, true)
    && FileSystem.isFileExists(_config.fileState, true, false, '{}')) { //TODO: починить варнинг
    FileSystem.readJson(_config.fileState)
        .then(state => {
            state = state || {}
            store = createStore(appReducer, state, enhancer)
            const bot = new Telegram()
            bot.listen()

            //INFO: for test
            // const daily = new Timer('daily', type => {
            //     const promises = []
            //     Object.keys(store.getState().balance)
            //         .forEach(chatId => {
            //             //INFO: при большом количестве чатов тут будет жопа, надо слать бандлами
            //             promises.push(bot.trigger(_commands.BALANCE_STATS, new Message({
            //                 chat: {
            //                     id: chatId
            //                 },
            //                 text: `/stat`
            //             })))
            //         })
            //     Promise.all(promises)
            //         .then(res => log(`Ежедневная рассылка прошла успешно.`, logLevel.INFO))
            //         .catch(ex => log(`Ежедневная рассылка прошла с ошибкой. ${ex}`, logLevel.ERROR))
            //     const dt = new Date()
            //     let nextDay = lib.time.getChangedDateTime({ days: 1, minutes: 23 },
            //         new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()))
            //     daily.start({ dateTime: nextDay })
            // })

            const weekly = new Timer('weekly', type => {
                const promises = []
                Object.keys(store.getState().balance)
                    .forEach(chatId => {
                        //INFO: при большом количестве чатов тут будет жопа, надо слать бандлами
                        promises.push(bot.trigger(_commands.BALANCE_STATS, new Message({
                            chat: {
                                id: chatId
                            },
                            text: `/stat mo`
                        })))
                    })
                Promise.all(promises)
                    .then(res => log(`Еженедельная рассылка прошла успешно.`, logLevel.INFO))
                    .catch(ex => log(`Еженедельная рассылка прошла с ошибкой. ${ex}`, logLevel.ERROR))
                weekly.start({
                    dateTime: lib.time.getChangedDateTime({ minutes: 23 },
                        lib.time.getMonday(new Date(), true))
                })
            })
            const monthly = new Timer('monthly', type => {
                const promises = []
                Object.keys(store.getState().balance)
                    .forEach(chatId => {
                        //INFO: при большом количестве чатов тут будет жопа, надо слать бандлами
                        promises.push(bot.trigger(_commands.BALANCE_STATS, new Message({
                            chat: {
                                id: chatId
                            },
                            text: `/stat 1`
                        })))
                        promises.push(bot.trigger(_commands.BALANCE_REPORT, new Message({
                            chat: {
                                id: chatId,
                                title: `monthly-${lib.time.dateString()}`
                            },
                            text: `/repo`,
                        }), {
                                noBalance: true
                            }))
                    })
                Promise.all(promises)
                    .then(res => log(`Ежемесячная рассылка прошла успешно.`, logLevel.INFO))
                    .catch(ex => log(`Ежемесячная рассылка прошла с ошибкой. ${ex}`, logLevel.ERROR))
                const dt = new Date()
                const nextMonth = lib.time.getChangedDateTime({ months: 1, minutes: 23 },
                    new Date(dt.getFullYear(), dt.getMonth(), 1))
                monthly.start({ dateTime: nextMonth })
            })

            log('Set timers...', logLevel.INFO)
            let monday = lib.time.getChangedDateTime({ minutes: -7 },
                lib.time.getMonday(new Date(), true))
            log(`Set weekly timer. Next monday: ${monday}`, logLevel.INFO)
            weekly.start({ dateTime: monday })

            const dt = new Date()
            let nextMonth = lib.time.getChangedDateTime({ months: 1, minutes: -7 },
                new Date(dt.getFullYear(), dt.getMonth(), 1))
            log(`Set monthly timer. Next month: ${nextMonth}`, logLevel.INFO)
            monthly.start({ dateTime: nextMonth })

            //INFO: for test
            // let nextDay = lib.time.getChangedDateTime({ days: 1, hours: -16 },
            //     new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()))
            // log(`Set daily timer. Next day: ${nextDay}`, logLevel.INFO)
            // daily.start({ dateTime: nextDay })

            // .then((data) => {
            //     l('🤖  Listening to incoming messages')
            // })
            // .catch(ex => log(ex, logLevel.ERROR))
        })
        .catch(x => {
            log(`Ошибка чтения файла прошлого состояния. err = ${x}`, logLevel.ERROR)
        })
}


