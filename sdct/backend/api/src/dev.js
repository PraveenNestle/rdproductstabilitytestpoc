process.env.LOCAL_MODE = 'true';
process.env.PORT = process.env.PORT || '8080';
await import('./server.js');