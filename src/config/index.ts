export const config = {
  server: {
    port: process.env.PORT ||3030,
    host: process.env.HOST || 'localhost',
  },
  api: {
    baseUrl: 'https://www.midjourney.com',
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
  },
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cookie',
      'x-csrf-protection'
    ],
    credentials: true,
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
  },
  allowedOrigins: [
    'https://www.midjourney.com',
    'https://proxima.midjourney.com',
    'https://cdn.midjourney.com',
    'https://www.google.com',
    'https://www.google.com.hk',
    'https://www.google.com.tw',
  ]
}; 