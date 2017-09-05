'use strict';Object.defineProperty(exports, "__esModule", { value: true });var isProduction = process.env.NODE_ENV === 'production';exports.default =

{
    isProduction: isProduction,
    log: isProduction ? 'INFO' : 'DEBUG',
    dirStorage: __dirname + '/storage/' };