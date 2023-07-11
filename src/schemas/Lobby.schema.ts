import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LobbyDocument = HydratedDocument<Lobby>;

@Schema()
export class Lobby {
  @Prop()
  name: string;

  @Prop()
  age: number;

  @Prop()
  breed: string;
}

export const LobbySchema = SchemaFactory.createForClass(Lobby);
