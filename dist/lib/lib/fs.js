'use strict';Object.defineProperty(exports, "__esModule", { value: true });exports.RxFileSystem = undefined;var _createClass = function () {function defineProperties(target, props) {for (var i = 0; i < props.length; i++) {var descriptor = props[i];descriptor.enumerable = descriptor.enumerable || false;descriptor.configurable = true;if ("value" in descriptor) descriptor.writable = true;Object.defineProperty(target, descriptor.key, descriptor);}}return function (Constructor, protoProps, staticProps) {if (protoProps) defineProperties(Constructor.prototype, protoProps);if (staticProps) defineProperties(Constructor, staticProps);return Constructor;};}(); // Source: https://nodejs.org/api/fs.html

var _fs = require('fs');var _fs2 = _interopRequireDefault(_fs);
var _jsonfile = require('jsonfile');var _jsonfile2 = _interopRequireDefault(_jsonfile);
var _rxjs = require('rxjs');var _rxjs2 = _interopRequireDefault(_rxjs);
var _rwlock = require('rwlock');var _rwlock2 = _interopRequireDefault(_rwlock);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}

var lock = new _rwlock2.default();var

FileSystem = function () {function FileSystem() {_classCallCheck(this, FileSystem);}_createClass(FileSystem, [{ key: 'readFile', value: function readFile(
        file) {
            return new Promise(function (resolve, reject) {
                lock.readLock(file, function (release) {
                    _fs2.default.readFile(file, function (err, data) {
                        release();
                        if (err) return reject(err);
                        return resolve(data);
                    });
                });
            });
        } }, { key: 'saveFile', value: function saveFile(
        file, data) {
            return new Promise(function (resolve, reject) {
                lock.writeLock(file, function (release) {
                    _fs2.default.writeFile(file, data, function (err) {
                        release();
                        if (err) return reject(err);
                        return resolve();
                    });
                });
            });
        } }, { key: 'appendFile', value: function appendFile(
        file, data) {
            return new Promise(function (resolve, reject) {
                lock.writeLock(file, function (release) {
                    _fs2.default.appendFile(file, data, function (err) {
                        release();
                        if (err) return reject(err);
                        return resolve();
                    });
                });
            });
        } }, { key: 'readJson', value: function readJson(
        file) {
            return new Promise(function (resolve, reject) {
                lock.readLock(file, function (release) {
                    _jsonfile2.default.readFile(file, function (err, data) {
                        release();
                        if (err) return reject(err);
                        return resolve(data);
                    });
                });
            });
        } }, { key: 'saveJson', value: function saveJson(
        file, data) {
            return new Promise(function (resolve, reject) {
                lock.writeLock(file, function (release) {
                    _jsonfile2.default.writeFile(file, data, function (err) {
                        release();
                        if (err) return reject(err);
                        return resolve();
                    });
                });
            });
        } }, { key: 'access', value: function access(
        path, mode) {
            return new Promise(function (resolve, reject) {
                lock.readLock(path, function (release) {
                    _fs2.default.access(path, mode, function (err) {
                        release();
                        if (err) reject(err);
                        resolve({ path: path, mode: mode });
                    });
                });
            });
        } }, { key: 'isExists', value: function isExists(
        path) {
            return this.access(path, _fs2.default.constants.F_OK);
        } }, { key: 'accessRead', value: function accessRead(
        path) {
            return this.access(path, _fs2.default.constants.R_OK);
        } }, { key: 'mkDir', value: function mkDir(
        path) {
            return new Promise(function (resolve, reject) {
                lock.writeLock(path, function (release) {
                    _fs2.default.mkdir(path, undefined, function (err) {
                        release();
                        if (err) return reject(err);
                        return resolve();
                    });
                });
            });
        } }, { key: 'readDir', value: function readDir(
        path) {
            return new Promise(function (resolve, reject) {
                lock.writeLock(path, function (release) {
                    _fs2.default.readdir(path, undefined, function (err, files) {
                        release();
                        if (err) return reject(err);
                        return resolve(files);
                    });
                });
            });
        } }]);return FileSystem;}();


// TODO: think about Scheduler use
exports.default = FileSystem;var RxFileSystem = exports.RxFileSystem = function () {
    function RxFileSystem() {_classCallCheck(this, RxFileSystem);
        this.filesystem = new FileSystem();
    }_createClass(RxFileSystem, [{ key: 'readFile', value: function readFile(
        file) {var scheduler = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
            return _rxjs2.default.Observable.fromPromise(this.filesystem.readFile(file), scheduler);
        } }, { key: 'saveFile', value: function saveFile(
        file, data) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.saveFile(file, data));
        } }, { key: 'appendFile', value: function appendFile(
        file, data) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.appendFile(file, data));
        } }, { key: 'readJson', value: function readJson(
        file) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.readJson(file));
        } }, { key: 'saveJson', value: function saveJson(
        file, data) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.saveJson(file, data));
        } }, { key: 'createReadStream', value: function createReadStream(
        file) {
            return _rxjs2.default.Observable.of(_fs2.default.createReadStream(file));
        } }, { key: 'access', value: function access(
        path, mode) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.access(path, mode));
        } }, { key: 'isExists', value: function isExists(
        path) {
            return this.access(path, _fs2.default.constants.F_OK).
            flatMap(function () {return _rxjs2.default.Observable.of(true);}).
            catch(function () {return _rxjs2.default.Observable.of(false);});
        } }, { key: 'accessRead', value: function accessRead(
        path) {
            return this.access(path, _fs2.default.constants.R_OK).
            flatMap(function () {return _rxjs2.default.Observable.of(true);}).
            catch(function () {return _rxjs2.default.Observable.of(false);});
        } }, { key: 'mkDir', value: function mkDir(
        path) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.mkDir(path));
        } }, { key: 'readDir', value: function readDir(
        path) {
            return _rxjs2.default.Observable.fromPromise(this.filesystem.readDir(path));
        } }]);return RxFileSystem;}();