import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Poker server listening on port ${PORT}`);
});
