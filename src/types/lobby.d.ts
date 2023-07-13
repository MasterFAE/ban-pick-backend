import type { LobbyItem } from './lobby-item';
import type { LobbyUser } from './lobby-user';

export type Lobby = {
  id: string;
  name: string;
  teamSize: number;
  pickSize: number;
  banSize: number;
  game: string;
  map: string;
  mode: string;
  password: string;
  adminId: string;
  teamA: LobbyUser[];
  teamB: LobbyUser[];
  teamA_Captain: LobbyUser;
  teamB_Captain: LobbyUser;
  phase: string;
  pickedItems: LobbyItem[];
  bannedItems: LobbyItem[];
  turn: string;
  turnStartedAt: Date;
  turnEndsAt: Date;
  turnClientId: string;
  started: boolean;
  turnNo?: number;
  simulation?: boolean;
};
