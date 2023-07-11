import { Logger, INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io/adapters';
import { ServerOptions, Server } from 'socket.io';

export class WSAdapter extends IoAdapter {
  private readonly logger = new Logger(WSAdapter.name);
  constructor(private app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const cors = {
      origin: '*',
    };

    const optionsWithCORS: ServerOptions = {
      ...options,
      cors,
    };
    //ws port
    const server: Server = super.createIOServer(1112, optionsWithCORS);
    this.logger.debug('Created socket.io server...');
    return server;
  }
}
