import { loadConfig } from './config';
import { createApp } from './app';
import { VoteIntegrityClient } from './resultsSource';

const config = loadConfig(); // throws, and the service won't start, if config is missing or weak

const app = createApp({
  source: new VoteIntegrityClient(config.voteIntegrityUrl, config.jwtSigningKey),
  jwtSigningKey: config.jwtSigningKey,
  releaseAt: config.releaseAt,
  trustProxy: config.trustProxy,
});

// Plain HTTP on localhost only; TLS terminates at the reverse proxy in front (SR-13, docs/SR-13-tls.md).
app.listen(config.port, '127.0.0.1', () => {
  console.log(`[results-api] listening on 127.0.0.1:${config.port}; public release at ${config.releaseAt.toISOString()}`);
});
