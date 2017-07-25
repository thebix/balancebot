import { Parser } from 'expr-eval'
import json2csv from 'json2csv'
import _config from '../config'
import { store, history } from '../server'
import {
    balanceInit, balanceChange, jsonSave, botCmd,
    setBotBalanceMessageId
} from '../actions'
import _commands from '../enums/commands'
import FileSystem from '../lib/filesystem'
import lib from '../lib/index'

import { log, logLevel, dateTimeString } from '../logger'

export default class Balance {
    constructor() {
        this.mapGroupsToButtons = this.mapGroupsToButtons.bind(this)
        this.sendBalance = this.sendBalance.bind(this)
        this.getUsersSums = this.getUsersSums.bind(this)
        this.getCategoriesSums = this.getCategoriesSums.bind(this)
        this.getCategoriesPercents = this.getCategoriesPercents.bind(this)
    }

    initIfNeed(message, bot) {
        const balance = store.getState().balance[message.chat.id]
        if (balance === undefined || balance === null || balance === '') {
            this.init(message, bot)
        }
    }
    init(message, bot) {
        const period = new Date().getMonth()
        store.dispatch(balanceInit(message.chat.id, period))
        this.balance(message, bot)
    }
    balance(message, bot) {
        let res = ''
        const balance = store.getState().balance[message.chat.id]
        const period = new Date().getMonth()
        if (balance === undefined || balance === null || balance === '') {
            store.dispatch(balanceInit(message.chat.id, period))
            res = store.getState().balanceInit[message.chat.id]
        }
        if (period !== balance.period) {
            store.dispatch(balanceInit(message.chat.id, period))
            res = store.getState().balanceInit[message.chat.id]
        }
        res = balance.balance
        bot.sendMessage(message.chat.id, `Остаток ${res} 🤖`)

        return res
    }
    change(message, bot) {
        let { text } = message
        store.dispatch(botCmd(message.chat.id, _commands.BALANCE_CHANGE))

        const parser = new Parser()
        try {
            text = parser.parse(text).evaluate()
        } catch (ex) {
            return bot.sendMessage(message.chat.id, 'Не понял выражение 🤖')
        }

        const period = new Date().getMonth()
        let balance = store.getState().balance[message.chat.id]
        if (balance && balance.period !== period)
            store.dispatch(balanceInit(message.chat.id, period))
        store.dispatch(balanceChange(message.chat.id, period, text))
        const newState = store.getState() // TODO: так нехорошо, надо высчитывать баланс
        balance = newState.balance[message.chat.id].balance
        store.dispatch(jsonSave(_config.fileState, newState))

        const groups = newState.paymentGroups[message.chat.id]
        if (!groups || groups.length === 0) { // для чата не заданы группы
            return this.sendBalance(message, bot, balance)
        }

        // сохранение истории
        const date = new Date()
        const historyItem = {
            id: message.id,
            date_create: date,
            date_edit: date,
            date_delete: null,
            category: 'uncat',
            value: text,
            user_id: message.from,
            comment: ''
        }
        const success = `Записал ${text}`
        return bot.sendMessage(message.chat.id, `${success} 🤖`)
            .then(x => {
                const cols = 3 // кол-во в блоке
                const buttons = [] // результат
                const blocksCount = parseInt(groups.length / cols, 10)
                    + ((groups.length % cols) > 0 ? 1 : 0)
                for (let i = 0; i < blocksCount; i += 1) {
                    buttons.push(
                        groups.slice(i * cols, cols * (i + 1))
                            .map(group => this.mapGroupsToButtons(x.message_id, group))
                    )
                }
                bot.editMessageText(`${success}. Выбери категорию 🤖`, {
                    message_id: x.message_id,
                    chat_id: message.chat.id,
                    reply_markup: JSON.stringify({
                        inline_keyboard: [[{
                            text: 'Удалить',
                            callback_data: JSON.stringify({
                                hId: x.message_id,
                                cmd: _commands.BALANCE_REMOVE
                            })
                        }], ...buttons
                        ]
                    })
                })
                historyItem.id = x.message_id
                history.create(historyItem, message.chat.id)
                    .catch(ex => log(ex, logLevel.ERROR))
                return this.sendBalance(message, bot, balance)
            }).catch(ex => {
                log(`Ошибка сохранения отправки сообщения боту. История записана с id сообщения от пользовалея = ${historyItem.id}. err = ${ex}.`)
                history.create(historyItem, message.chat.id)
                return this.sendBalance(message, bot, balance)
            })
    }
    categoryChange(message, bot, data) {
        store.dispatch(botCmd(message.chat.id, _commands.BALANCE_CATEGORY_CHANGE))

        // сохранение категории
        const { hId, gId } = data
        return history.getById(hId, message.chat.id)
            .then(historyItem => {
                const item = historyItem
                if (!item) {
                    bot.sendMessage(message.chat.id, 'Не удалось найти запись в истории 🤖')
                    return Promise.reject('Не удалось найти запись в истории 🤖')
                }
                const groups = store.getState().paymentGroups[message.chat.id] || []
                let oldCategory = ''
                if (item.category && item.category !== 'uncat')
                    oldCategory = `${item.category} -> `
                item.category = groups.filter(x => gId === x.id)[0].title
                const comment = item.comment ? `, ${item.comment}` : ''
                return history.setById(hId, item, message.chat.id)
                    .then(() => bot.editMessageText(`${item.value}, ${oldCategory}${item.category}${comment} 🤖`, {
                        message_id: hId,
                        chat_id: message.chat.id,
                        reply_markup: JSON.stringify({
                            inline_keyboard: [[{
                                text: 'Удалить',
                                callback_data: JSON.stringify({
                                    hId,
                                    cmd: _commands.BALANCE_REMOVE
                                })
                            }]]
                        })
                    }))
                    .catch(ex => log(ex, logLevel.ERROR))
            }).catch(ex => log(ex, logLevel.ERROR))
    }
    commentChange(message, bot) {
        store.dispatch(botCmd(message.chat.id, _commands.BALANCE_COMMENT_CHANGE))

        // сохранение коммента к последней записи
        return history.getAll(message.chat.id)
            .then(data => {
                let all = data
                if (!all || all.constructor !== Array)
                    all = []
                let article = all.sort((i1, i2) => i2.id - i1.id)
                if (!article || article.length === 0) {
                    return bot.sendMessage(message.chat.id, 'Не удалось найти запись в истории 🤖')
                }
                article = article[0]
                article.comment = message.text

                return history.setById(article.id, article, message.chat.id)
                    .then(() => {
                        bot.editMessageText(`${article.value}, ${article.category}, ${article.comment} 🤖`, {
                            message_id: article.id,
                            chat_id: message.chat.id,
                            reply_markup: JSON.stringify({
                                inline_keyboard: [[{
                                    text: 'Удалить',
                                    callback_data: JSON.stringify({
                                        hId: article.id,
                                        cmd: _commands.BALANCE_REMOVE
                                    })
                                }]]
                            })
                        }).then(() => {
                            // TODO: нужна проверка, что баланс этого периода
                            const balance = store.getState().balance[message.chat.id].balance
                            return this.sendBalance(message, bot, balance)
                        }).catch(ex => log(ex, logLevel.ERROR))
                    })
            }).catch(ex => log(ex, logLevel.ERROR))
    }
    delete(message, bot, data) {
        // удаление записи
        const { hId } = data
        let success = ''
        let newBalance
        return history.getById(hId, message.chat.id)
            .then(historyItem => {
                const item = historyItem
                if (!item) {
                    bot.sendMessage(message.chat.id, 'Не удалось найти запись в истории 🤖')
                    return Promise.reject('Не удалось найти запись в истории 🤖')
                }
                if (item.date_delete) {
                    // bot.sendMessage(message.chat.id, `Запись уже была удалена 🤖`)
                    return Promise.resolve()
                }
                store.dispatch(botCmd(message.chat.id, _commands.BALANCE_REMOVE))
                item.date_delete = new Date()
                const balance = store.getState().balance[message.chat.id] || {}
                if (balance.period !== item.date_delete.getMonth()) {
                    success = `${item.value} удалено из истории. Остаток за текущий месяц не изменился 🤖`
                } else {
                    store.dispatch(balanceChange(message.chat.id,
                        new Date(item.date_create).getMonth(),
                        -item.value))
                    newBalance = parseInt(balance.balance, 10) + parseInt(item.value, 10)
                    success = `${item.value}, ${item.category}, ${item.comment} удалено из истории 🤖`
                }
                return history.setById(hId, item, message.chat.id)
            })
            .then(() => {
                if (newBalance !== undefined)
                    this.sendBalance(message, bot, newBalance, false)
                return bot.editMessageText(`${success}`, {
                    message_id: hId,
                    chat_id: message.chat.id
                })
            })
            .catch(ex => log(ex, logLevel.ERROR))
    }
    mapGroupsToButtons(id, group, replyId) {
        return {
            text: group.title,
            callback_data: JSON.stringify({
                gId: group.id,
                hId: id,
                rId: replyId,
                cmd: _commands.BALANCE_CATEGORY_CHANGE
            })
        }
    }
    sendBalance(message, bot, balance, isNewMessage = true) {
        const messageId = store.getState().botBalanceMessageId[message.chat.id]
        if (!messageId || isNewMessage) {
            return bot.sendMessage(message.chat.id, `Остаток ${balance} 🤖`)
                .then(x => {
                    store.dispatch(setBotBalanceMessageId(message.chat.id, x.message_id))
                })
        }
        return bot.editMessageText(`Остаток ${balance} 🤖`, {
            message_id: messageId,
            chat_id: message.chat.id,
        })
    }

    report(message, bot, noBalance = false) {
        let file
        return history.getAll(message.chat.id)
            .then(archive => {
                const all = archive.filter(x => !x.date_delete).sort((a, b) => b.id - a.id)
                const { users } = store.getState()
                const fields = [{
                    label: 'Дата', // Supports duplicate labels (required, else your column will be labeled [function])
                    value(row) { // lint: , field, data
                        return dateTimeString(new Date(row.date_create))
                    },
                    default: 'NULL' // default if value function returns null or undefined
                }, 'value', 'category', 'comment', {
                    label: 'Юзер', // Supports duplicate labels (required, else your column will be labeled [function])
                    value(row) { // lint: , field, data
                        return `${users[row.user_id].firstName} ${users[row.user_id].lastName}`
                    },
                    default: 'NULL' // default if value Îfunction returns null or undefined
                }, 'id'];
                const fieldNames = ['Дата', 'Сумма', 'Категория', 'Комментарий', 'Юзер', 'id']
                const csv = json2csv({ data: all, fields, fieldNames });
                if (FileSystem.isDirExists(_config.dirStorage, true)
                    && FileSystem.isDirExists(`${_config.dirStorage}repo`, true)) {
                    file = `repo-${message.chat.title}.csv`

                    return FileSystem.saveFile(`${_config.dirStorage}repo/${file}`, csv)
                }
                return bot.sendMessage(message.chat.id, 'Нет ранее сохраненных трат для этого чата 🤖')
            })
            .then(() => bot.sendDocument(message.chat.id, `${_config.dirStorage}repo/${file}`))
            .then(() => {
                if (noBalance)
                    return Promise.resolve()
                // TODO: нужна проверка, что баланс этого периода
                const balance = store.getState().balance[message.chat.id].balance
                return this.sendBalance(message, bot, balance)
            })
            .catch(ex => log(`chatId='${message.chat.id}', ex=${ex}`, logLevel.ERROR))
    }

    stats(message, bot) {
        // получение интервала
        let dateEnd,
            dateStart,
            dateEndUser
        const split = (`${message.text}`).split(' ')
        if (split.length === 1) { // без параметров => просто статистика за текущий месяц
            dateEnd = new Date()
            dateStart = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), 1)
            dateEndUser = dateEnd
        } else if (split.length < 3) { // дата начала - до - текущая дата
            dateEnd = new Date()
            dateStart = lib.time.getBack(split[1].trim(' '), dateEnd)
            dateEndUser = dateEnd
        } else { // дата начала - до - дата окончания
            // если юзер вводил, он ввел день окончания, который тоже должен попасть в отчет
            const end = lib.time.getBack(split[2].trim(' ')) // дата окончания (начало даты 0:00)
            dateStart = lib.time.getBack(split[1].trim(' '), end)
            dateEnd = lib.time.getChangedDateTime({ days: 1 },
                lib.time.getBack(split[2].trim(' ')))
            if (lib.time.isDateSame(dateStart, dateEnd))
                dateEndUser = dateEnd
            else
                // юзеру показывается дата на 1 меньше
                dateEndUser = lib.time.getChangedDateTime({ days: -1 }, dateEnd)
        }
        const dateEndTime = dateEnd.getTime()
        const dateStartTime = dateStart.getTime()
        const userId = null // 84677480

        store.dispatch(botCmd(message.chat.id, _commands.BALANCE_STATS, {
            dateEndTime,
            dateStartTime,
            dateEndUser,
            userId
        }))

        const { users, paymentGroups, nonUserPaymentGroups } = store.getState()
        const hasCats = paymentGroups[message.chat.id]
            && Object.keys(paymentGroups[message.chat.id]).length > 0
        let sumsText = 'Потрачено [в этом | в среднем]:'
        let sumsCatsText = 'По категориям [в этом | в среднем]:'
        let percCatsText = 'Проценты [в этом | за все время]:'
        let categories = hasCats ? paymentGroups[message.chat.id]
            .sort((cat1, cat2) => cat1.id - cat2.id) : []

        let usersSumsByCurrent = {}
        let catsSumsByCurrent = {}
        const usersSumsBefore = {}
        const catsSumsBefore = {}
        const periodsCount = {}
        let all = [] // все записи истории чата
        const periods = [] // все прошлые периоды (кроме текущего)
        const nonUserGroups = nonUserPaymentGroups[message.chat.id]
        // сколько потрачено за период / в среднем за прошлые
        const titleInfo = `Период: ${lib.time.dateWeekdayString(dateStart)} - ${lib.time.dateWeekdayString(dateEndUser)}\nДней: ${lib.time.daysBetween(dateStart, dateEnd)}`
        bot.sendMessage(message.chat.id, `${titleInfo} 🤖`)
            .then(() => history.getAll(message.chat.id))
            .then(data => { //
                all = data ? data.filter(item => !item.date_delete) : []
                if (!all || all.length === 0)
                    return bot.sendMessage(message.chat.id, 'Нет истории. 🤖')

                // получение интервалов
                const dateFirst = new Date(all[all.length - 1].date_create)
                const dateFirstTime = dateFirst.getTime()
                const curTicks = dateEndTime - dateStartTime
                if (curTicks < 1000 * 60 * 60 * 4)
                    return bot.sendMessage(message.chat.id, 'Слишком короткий интервал. Минимум 4 часа. 🤖')

                let curDateEnd = lib.time.getChangedDateTime({ ticks: -1 }, dateStart)
                let curDateStart = lib.time.getChangedDateTime({ ticks: -curTicks }, curDateEnd)
                while (curDateEnd.getTime() >= dateFirstTime) {
                    periods.push({
                        start: curDateStart,
                        end: curDateEnd
                    })
                    curDateEnd = lib.time.getChangedDateTime({ ticks: -1 }, curDateStart)
                    curDateStart = lib.time.getChangedDateTime({ ticks: -curTicks }, curDateEnd)
                }

                // получение за прошлые периоды
                const periodsCountTmp = {}
                periods.forEach(period => {
                    // сколько потрачено за период / в среднем за прошлые
                    const curUsrSums =
                        this.getUsersSums(all, period.start, period.end, nonUserGroups)
                    const allKeys = Object.keys(usersSumsBefore)
                    Object.keys(curUsrSums).forEach(key => {
                        if (allKeys.indexOf(key) !== -1)
                            usersSumsBefore[key] += curUsrSums[key]
                        else
                            usersSumsBefore[key] = curUsrSums[key]
                    })

                    // траты по категориям / средние траты за %период%
                    if (hasCats) {
                        const curCatSums =
                            this.getCategoriesSums(all, period.start, period.end, userId)
                        const allCatSumsKeys = Object.keys(catsSumsBefore)

                        Object.keys(curCatSums).forEach(key => {
                            const curCatSum = curCatSums[key] || 0
                            if (!periodsCountTmp[key])
                                periodsCountTmp[key] = 1
                            else
                                periodsCountTmp[key] += 1

                            if (curCatSum > 0) {
                                periodsCount[key] = periodsCountTmp[key]
                            }

                            if (allCatSumsKeys.indexOf(key) !== -1)
                                catsSumsBefore[key] += curCatSum
                            else
                                catsSumsBefore[key] = curCatSum
                        })
                    }
                })

                return Promise.resolve(true)
            })
            .then(() => {
                // траты в этом месяце
                usersSumsByCurrent = this.getUsersSums(all, dateStart, dateEnd, nonUserGroups)

                // сколько потрачено за период / в среднем за прошлые
                // key - либо userId, либо категория из nonUserGroups
                Object.keys(usersSumsByCurrent).forEach(key => {
                    let userName,
                        perCount // кол-во периодов
                    if (users[key]) {
                        userName = `${users[key].firstName} ${users[key].lastName}`
                        perCount = periods.length // кол-во периодов для юзера - все
                    } else {
                        userName = key // название категории из nonUserGroups
                        perCount = periodsCount[key] // кол-во периодов для каждой категории свое
                    }

                    const sum = Math.round(usersSumsByCurrent[key]) || 0
                    const bef = Math.round(usersSumsBefore[key] / perCount) || 0
                    sumsText = `${sumsText}\r\n${userName}: ${sum} | ${bef}` // TODO: учитывать при этом не полный интервал (первый)
                })
                return bot.sendMessage(message.chat.id, `${sumsText} 🤖`)
            })
            .then(() => {
                if (!hasCats) return Promise.resolve({})
                // траты по категориям
                catsSumsByCurrent = this.getCategoriesSums(all, dateStart, dateEnd, userId)
                categories = categories.sort(
                    (cat1, cat2) => (catsSumsByCurrent[cat2.title] || 0)
                        - (catsSumsByCurrent[cat1.title] || 0))

                // траты по категориям / средние траты за %период%
                // let i
                // for (i = 0; i < categories.length; i += 1) {
                //     const { title } = categories[i]
                //     const cur = Math.round(catsSumsByCurrent[title])
                //     const bef = Math.round(catsSumsBefore[title] / periodsCount[title])
                //     if (!cur || (!cur && !bef))
                //         return true
                // TODO: учитывать при этом не полный интервал (первый)
                //     sumsCatsText = `${sumsCatsText}\r\n${title}: ${cur || 0} | ${bef || 0}`
                // }
                // lint:
                categories.forEach(cat => {
                    const cur = Math.round(catsSumsByCurrent[cat.title])
                    const bef = Math.round(catsSumsBefore[cat.title] / periodsCount[cat.title])
                    // lint: if (!cur || (!cur && !bef))
                    if (cur)
                        sumsCatsText = `${sumsCatsText}\r\n${cat.title}: ${cur || 0} | ${bef || 0}` // TODO: учитывать при этом не полный интервал (первый)
                })
                return bot.sendMessage(message.chat.id, `${sumsCatsText} 🤖`)
            })
            .then(() => {
                if (!hasCats) return Promise.resolve({})
                // поцентное соотношение по группам
                // / (не сделал)в среднем до этого за %период% / за все время
                const cats = this.getCategoriesPercents(catsSumsByCurrent)
                const catsBefore = this.getCategoriesPercents(catsSumsBefore)

                categories.forEach(cat => {
                    const cur = Math.round(cats[cat.title])
                    const bef = Math.round(catsBefore[cat.title])
                    if (cur)
                        percCatsText = `${percCatsText}\r\n${cat.title}: ${cur || 0}% | ${bef || 0}%` // TODO: учитывать при этом не полный интервал (первый)
                })
                return bot.sendMessage(message.chat.id, `${percCatsText} 🤖`)
            })
            .then(() => {
                // TODO: нужна проверка, что баланс этого периода
                const balance = store.getState().balance[message.chat.id].balance
                return this.sendBalance(message, bot, balance)
            })
            .catch(ex => log(`chatId='${message.chat.id}', ex=${ex}`, logLevel.ERROR))
    }

    getCategoriesPercents(catsSums) {
        const categories = Object.keys(catsSums)
        const sum = categories.reduce((acc, val) => {
            if (isNaN(catsSums[val]))
                return acc
            return acc + catsSums[val]
        }, 0)
        const result = {}
        let sumWithoutLast = 0
        categories.forEach((cat, i) => {
            if (isNaN(catsSums[cat]))
                result[cat] = 'err'
            else if (i === (categories.length - 1))
                result[cat] = 100 - sumWithoutLast
            else {
                result[cat] = Math.round(catsSums[cat] * 100 / sum)
                sumWithoutLast += result[cat]
            }
        })
        return result
    }

    // сколько потрачено за период / в среднем за прошлые
    getUsersSums(all = [], dateStart = new Date(), dateEnd = new Date(), nonUserPaymentGroups = []
    ) {
        const dateStartTime = dateStart.getTime()
        const dateEndTime = dateEnd.getTime()

        const current = all // filter
            .filter(item => !dateStartTime || new Date(item.date_create).getTime() >= dateStartTime)
            .filter(item => !dateEndTime || new Date(item.date_create).getTime() < dateEndTime)
        const result = {}
        Array.from(new Set( // http://stackoverflow.com/questions/1960473/unique-values-in-an-array
            current.map(item => item.user_id)))
            .forEach(userId => {
                const sum = current
                    .filter(item => item.user_id === userId
                        && nonUserPaymentGroups.indexOf(item.category) === -1)
                    .reduce((acc, val) => {
                        if (isNaN(val.value))
                            return acc
                        return acc + val.value
                    }, 0)
                result[userId] = sum
            })

        nonUserPaymentGroups.forEach(cat => {
            const sum = current
                .filter(item => item.category === cat)
                .reduce((acc, val) => {
                    if (isNaN(val.value))
                        return acc
                    return acc + val.value
                }, 0)
            result[cat] = sum
        })

        Array.from(new Set( // http://stackoverflow.com/questions/1960473/unique-values-in-an-array
            current.map(item => item.user_id)))
            .forEach(userId => {
                const sum = current
                    .filter(item => item.user_id === userId
                        && nonUserPaymentGroups.indexOf(item.category) === -1)
                    .reduce((acc, val) => {
                        if (isNaN(val.value))
                            return acc
                        return acc + val.value
                    }, 0)
                result[userId] = sum
            })
        return result
    }

    // Траты по категориям / средние траты за %период%
    getCategoriesSums(all = [], dateStart = new Date(), dateEnd = new Date(), userId = null) {
        const dateStartTime = dateStart.getTime()
        const dateEndTime = dateEnd.getTime()

        const current = all // filter
            .filter(item => !dateStartTime || new Date(item.date_create).getTime() >= dateStartTime)
            .filter(item => !dateEndTime || new Date(item.date_create).getTime() < dateEndTime)
            .filter(item => !userId || item.user_id === userId)
        const result = {}
        Array.from(new Set( // http://stackoverflow.com/questions/1960473/unique-values-in-an-array
            current.map(item => item.category)))
            .forEach(category => {
                const sum = current
                    .filter(item => item.category === category)
                    .reduce((acc, val) => {
                        if (isNaN(val.value))
                            return acc
                        return acc + val.value
                    }, 0)
                result[category] = sum
            })
        return result
    }
}

