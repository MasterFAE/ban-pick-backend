import { LobbyItem } from './lobby-item';

export type LobbyUser = {
  id: string;
  username: string;
  picked?: LobbyItem;
};
