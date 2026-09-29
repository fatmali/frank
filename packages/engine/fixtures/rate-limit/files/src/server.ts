import express from 'express';
import { publicRouter } from './routes/public';
import { internalRouter } from './routes/internal';

const app = express();

// Load balancer health check. Polled every 2 seconds.
app.get('/health', (_req, res) => res.send('ok'));

app.use('/api/public', publicRouter);
app.use('/api/internal', internalRouter);

app.listen(3000);
