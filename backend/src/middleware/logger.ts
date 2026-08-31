import pino from 'pino'
import { pinoHttp, type Options } from 'pino-http'
import { env } from '../config/env.js'

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.apiKey', '*.api_key'],
    censor: '[REDACTED]',
  },
  base: undefined,
})

const httpLoggerOptions: Options = {
  logger,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  quietReqLogger: true,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
}

export const httpLogger = pinoHttp(httpLoggerOptions)
