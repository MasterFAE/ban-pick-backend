import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { EventsGateway } from './events/events.gateway';
import { Database } from './database/database';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    GameModule,
    // EventsGateway,
    MongooseModule.forRoot(
      'mongodb+srv://fdwsknfkwefkwefs:asd123@cluster1.9dedabq.mongodb.net/?retryWrites=true&w=majority',
    ),
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService, Database],
})
export class AppModule {}
