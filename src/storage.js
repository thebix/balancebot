// in memory sotrage.

import { BehaviorSubject, Subscription /* , of, from */, Observable } from 'rxjs'
// import { switchMap, catchError, map, mapTo, tap, mergeMap, filter } from 'rxjs/operators'
import lib from './lib/root'
import { log, logLevel } from './logger';
import config from './config';

// INFO: return Single / Maybe / etc if it's possible for rxjs

class Storage {
    constructor(dirStorage, fileNameTemplate = 'data-$[id].json') {
        this.fileNameTemplate = fileNameTemplate
        this.dirStorage = dirStorage
        this.getFilePath = this.getFilePath.bind(this)
        this.getStorage = this.getStorage.bind(this)
        this.isTemplateWithId = this.fileNameTemplate.indexOf('$[id]') !== -1
        this.storage = {}
        this.isFsLoadedBehaviorSubject = new BehaviorSubject(false)
        this.compositeSubscription = new Subscription()
        // load saved storage from fs
        // check if directory and file exists, if not - create
        this.compositeSubscription.add(lib.fs.isExists(dirStorage)
            // .pipe(
            .switchMap(isStorageDirExists => {
                if (isStorageDirExists !== true) {
                    log(`Storage:constructor: storage directory doesn't exists, creating. path: <${dirStorage}>`, logLevel.INFO)
                    return lib.fs.mkDir(dirStorage)
                        // .pipe(
                        // .catchError(error => {
                        //     throw new Error(`Storage:constructor: can't create storage directory. path: <${dirStorage}>. error: <${error}>`) // eslint-disable-line max-len
                        // })
                        .do(null, error => {
                            throw new Error(`Storage:constructor: can't create storage directory. path: <${dirStorage}>. error: <${error}>`) // eslint-disable-line max-len
                        })
                    // )
                }
                // return of(true)
                return Observable.of(true)
            })
            .switchMap(() => lib.fs.readDir(dirStorage))
            .switchMap(fileNames => {
                if (this.isTemplateWithId)
                    // return from(fileNames)
                    return Observable.from(fileNames)
                log(`Storage:constructor: since the fileNameTemplate <${this.fileNameTemplate}> hasn't any parts to change, only one file with this name will be taken`, logLevel.INFO) // eslint-disable-line max-len
                if (fileNames.indexOf(this.fileNameTemplate) !== -1)
                    // return of(this.fileNameTemplate)
                    return Observable.of(this.fileNameTemplate)
                return lib.fs.saveJson(`${this.dirStorage}${this.fileNameTemplate}`, {})
                    // .pipe(
                    .mapTo(this.fileNameTemplate)
                // )
            })
            .filter(fileName => {
                if (!fileName)
                    return false
                if (this.isTemplateWithId) {
                    const regexString = this.fileNameTemplate.split('$[id]').join('.+')
                    const regex = new RegExp(regexString)
                    return fileName.match(regex)
                }
                return true
            })
            .mergeMap(fileName =>
                lib.fs.readJson(`${this.dirStorage}${fileName}`)
                    // .pipe(
                    .map(fileStorage => ({ fileName, fileStorage })))
            // )
            // .tap(fileNameAndStorage => {
            .do(fileNameAndStorage => {
                const { fileName, fileStorage } = fileNameAndStorage
                if (this.isTemplateWithId) {
                    const fileTemplateParts = this.fileNameTemplate.split('$[id]')
                    const fileTemplateIdIndex = this.fileNameTemplate.indexOf('$[id]')
                    const fileTemplateAfterIdIndex = fileTemplateParts[1] ? fileName.indexOf(fileTemplateParts[1]) : undefined
                    const templateId = fileName.slice(fileTemplateIdIndex, fileTemplateAfterIdIndex)
                    this.storage[templateId] = fileStorage
                } else {
                    this.storage = fileStorage
                }
            })
            // .catchError(error => {
            //     throw new Error(`Storage:constructor: can't read storage file. error: <${error}>`)
            // })
            .do(null, error => {
                throw new Error(`Storage:constructor: can't read storage file. error: <${error}>`)
            })
            // )
            .subscribe(
                () => { },
                initError => {
                    log(initError, logLevel.ERROR)
                    this.compositeSubscription.unsubscribe()
                },
                () => {
                    this.isFsLoadedBehaviorSubject.next(true)
                    this.compositeSubscription.unsubscribe()
                }
            ))
    }
    isInitialized() {
        return this.isFsLoadedBehaviorSubject.asObservable()
    }
    // TODO: make it protected
    getStorage(id) {
        if (id) {
            if (!this.storage[id])
                this.storage[id] = {}
            return this.storage[id]
        }
        if (!this.storage)
            this.storage = {}
        return this.storage
    }
    getKeys(id = undefined) {
        const storageById = this.getStorage(id)
        // return of(Object.keys(storageById))
        return Observable.of(Object.keys(storageById))
    }
    getItem(field, id = undefined) {
        return Observable.of(this.getStorage(id)[field])
        // return of(this.getStorage(id)[field])
    }
    getItems(fieldsArray = [], id = undefined) {
        const result = {}
        const storageById = this.getStorage(id)
        fieldsArray.forEach(field => {
            result[field] = storageById[field]
        })
        // return of(result)
        return Observable.of(result)
    }
    updateItem(fieldName, item, id = undefined) {
        const storageById = this.getStorage(id)
        const field = fieldName || '0'
        storageById[field] = item
        const oldValue = Object.assign({}, storageById[field])
        return lib.fs.saveJson(this.getFilePath(id), storageById)
            // .pipe(
            .map(() => true)
            // .catchError(error => {
            //     log(`Storage:updateItem: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
            //     // rollback changes to fs storage to previous values on error
            //     storageById[field] = oldValue
            //     return of(false)
            // })
            .do(null, error => {
                log(`Storage:updateItem: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
                // rollback changes to fs storage to previous values on error
                storageById[field] = oldValue
                return Observable.of(false)
            })
        // )
    }
    // itemsArray = [{item}]
    updateItemsByMeta(itemsArray = [], id = undefined) {
        const itemsToUpdate = []
        itemsArray.forEach(itemToSave => {
            itemsToUpdate.push(...Object.keys(itemToSave)
                .map(key => ({
                    fieldName: key,
                    item: itemToSave[key]
                })))
        })

        return this.updateItems(itemsToUpdate, id)
    }
    // itemsArray = [{fieldName, item}]
    updateItems(itemsArray = [], id = undefined) {
        const storageById = this.getStorage(id)
        const oldValues = {}
        itemsArray.forEach(itemToSave => {
            const { fieldName, item } = itemToSave
            const field = fieldName || '0'
            oldValues[field] = Object.assign({}, storageById[field])
            storageById[field] = item
        })
        return lib.fs.saveJson(this.getFilePath(id), storageById)
            // .pipe(
            .map(() => true)
            // .catchError(error => {
            //     log(`Storage:updateItems: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
            //     // rollback changes to fs storage to previous values on error
            //     itemsArray.forEach(itemToSave => {
            //         const { fieldName } = itemToSave
            //         const field = fieldName || '0'
            //         storageById[field] = oldValues[field]
            //     })
            //     return of(false)
            // })
            .do(null, error => {
                log(`Storage:updateItems: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
                // rollback changes to fs storage to previous values on error
                itemsArray.forEach(itemToSave => {
                    const { fieldName } = itemToSave
                    const field = fieldName || '0'
                    storageById[field] = oldValues[field]
                })
                // return of(false)
                return Observable.of(false)
            })
        // )
    }
    removeItem(fieldName, id = undefined) {
        const storageById = this.getStorage(id)
        const field = fieldName || '0'
        const oldValue = Object.assign({}, storageById[field])
        delete storageById[field]
        return lib.fs.saveJson(this.getFilePath(id), storageById)
            // .pipe(
            .map(() => true)
            // .catchError(error => {
            //     log(`Storage:removeItem: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
            //     // rollback changes to fs storage to previous values on error
            //     storageById[field] = oldValue
            //     return of(false)
            // })
            .do(null, error => {
                log(`Storage:removeItem: can't save to state file. path: <${this.getFilePath(id)}>, error:<${error}>`, logLevel.ERROR)
                // rollback changes to fs storage to previous values on error
                storageById[field] = oldValue
                return Observable.of(false)
            })
        // )
    }
    getFilePath(templateId = null) {
        const file = templateId
            ? `${this.fileNameTemplate.replace('$[id]', templateId)}`
            : this.fileNameTemplate
        return `${this.dirStorage}${file}`
    }
}

// TODO: maybe ItemsState
class ChatsState extends Storage {
    constructor(dirStorage) {
        super(dirStorage, 'state.json')
    }
    getItem(field, stateId) {
        return super.getItem(stateId)
            // .pipe(
            .map(chat => (
                chat ? chat[field] : undefined
            ))
        // )
    }
    getItems(fieldsArray = [], stateId) {
        return super.getItem(stateId)
            // .pipe(
            .map(chat => {
                const result = {}
                fieldsArray.forEach(field => {
                    result[field] = chat[field]
                })
                return result
            })
        // )
    }
    updateItem(fieldName, item, stateId) {
        return super.getItem(stateId)
            // .pipe(
            .switchMap(chat => {
                const chatNew = Object.assign({}, chat, { [fieldName]: item })
                return super.updateItem(stateId, chatNew)
            })
        // )
    }
    // itemsArray = [{item}]
    updateItemsByMeta(itemsArray = [], stateId) {
        return super.getItem(stateId)
            // .pipe(
            .switchMap(chat => {
                const chatNew = Object.assign({}, chat)
                itemsArray.forEach(itemToSave => {
                    Object.keys(itemToSave)
                        .forEach(key => {
                            chatNew[key] = itemToSave[key]
                        })
                })
                return super.updateItem(stateId, chatNew)
            })
        // )
    }
    // itemsArray = [{fieldName, item}]
    updateItems(itemsArray = [], stateId) {
        return super.getItem(stateId)
            // .pipe(
            .switchMap(chat => {
                const chatNew = Object.assign({}, chat)
                itemsArray.forEach(itemToSave => {
                    const { fieldName, item } = itemToSave
                    const field = fieldName || '0'
                    chatNew[field] = item
                })
                return super.updateItem(stateId, chatNew)
            })
        // )
    }
    removeItem(fieldName, stateId) {
        super.getItem(stateId)
            // .pipe(
            .switchMap(chat => {
                const chatNew = Object.assign({}, chat)
                delete chatNew[fieldName]
                return super.updateItem(stateId, chatNew)
            })
        // )
    }
    getStates(isActive = undefined) {
        const states = super.getStorage()
        if (isActive !== true && isActive !== false)
            return Observable.of(states)
        // return of(states)
        const statesArray = Object.keys(states)
            .map(key => Object.assign({}, {
                key,
                state: states[key]
            }))
            .filter(({ state }) => state.isActive === isActive)

        const result = {}
        statesArray.forEach(({ key, state }) => {
            result[key] = state
        })
        return Observable.of(result)
        // return of(result)
    }
    archive(stateId) {
        return this.updateItem('isActive', false, stateId)
    }
}

const state = new ChatsState(config.dirStorage)
export const storage = new Storage(`${config.dirStorage}data/`)

export default state
