import express from 'express';
import { TallyDb } from './db/tallyDb';
import { createTallyRouter } from './routes/tally';

export function createApp(db: TallyDb) {
  const app = express();
  app.use(express.json());
  app.use('/tally', createTallyRouter(db));
  return app;
}