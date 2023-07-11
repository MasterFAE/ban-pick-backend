import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { subscribe } from 'diagnostics_channel';
import { Namespace, Socket } from 'socket.io';
import type { Lobby } from 'src/types/lobby';
import { LobbyItem } from 'src/types/lobby-item';
import { LobbyUser } from 'src/types/lobby-user';
@WebSocketGateway({ transports: ['websocket'] })
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private logger: Logger = new Logger('EventsGateway');
  @WebSocketServer() io: Namespace;
  private lobbies: Lobby[] = [];
  private users = [];

  afterInit() {
    console.log('Websocket has initialized');
    this.checkTurnTimer();
  }

  async handleConnection(client) {
    console.log('Client connected: ' + client.id);
  }

  async handleDisconnect(client) {
    console.log('Client disconnected: ' + client.id);
  }

  /* 
    TODO: 

    * Actions:
      * New lobby
      * Join lobby
      * Leave lobby
      * Delete Lobby
      * Start Pick&Ban
      * Ban Item
      * Pick Item
      * Switch Sides

    * Functional:
      * Lobby password hashing
      * Pick and ban item control according to game mode and name
      * Lobby pick/ban time control
      * When switching sides lobby must be started: false
      * When switching sides team captains must be changed if switching user is the captain
      * When captain switches side change captain of the other team
      * Team switching only be available when lobby is started: false
      * Check if user is in the lobby before banning/picking


  */

  @SubscribeMessage('createLobby')
  handleNewLobby(
    client,
    payload: {
      id: string;
      userName: string;
      name: string;
      teamSize: number;
      map: string;
      mode: string;
      pickSize: number;
      banSize: number;
      password: string;
    },
  ) {
    let lobby = {
      ...payload,
      teamA: [{ id: client.id, username: payload.userName }],
      teamB: [],
      teamA_Captain: { id: client.id, username: payload.userName },
      teamB_Captain: null,
      adminId: client.id,
      pickedItems: [],
      bannedItems: [],
      phase: 'ban',
      turn: 'teamA',
      turnClientId: null,
      started: false,
      turnStartedAt: null,
      turnEndsAt: null,
    };

    this.lobbies.push(lobby);
    client.join(payload.id);
    return payload;
  }

  @SubscribeMessage('joinLobby')
  handleJoinLobby(client: any, payload: any) {
    let lobby = this.lobbies.find((lobby) => lobby.id === payload.id);
    // Check if lobby exists
    if (!lobby) {
      client.emit('error', 'Lobby Not Found');
      return;
    }

    // Check if lobby passwords match
    if (lobby.password !== payload.password) {
      client.emit('error', 'Wrong Password');
      return;
    }

    // Check if lobby is full
    if (
      lobby.teamA.length === lobby.teamSize &&
      lobby.teamB.length === lobby.teamSize
    ) {
      client.emit('error', 'Lobby is full');
      return;
    }
    if (
      lobby.teamA.find((user) => user.id === client.id) ||
      lobby.teamB.find((user) => user.id === client.id)
    ) {
      client.emit('error', 'You are already in this lobby');
      return;
    }

    let user: LobbyUser = { id: client.id, username: payload.userName };
    // Distribute users to teams
    if (lobby.teamA.length > lobby.teamB.length) {
      // Attach user as team captain if team B is empty
      if (!lobby.teamB.length) lobby.teamB_Captain = user;
      lobby.teamB.push(user);
    } else {
      // Attach user as team captain if team A is empty
      if (!lobby.teamA.length) lobby.teamA_Captain = user;
      lobby.teamA.push(user);
    }
    // Send lobby update to all users in lobby
    this.io.to(payload.id).emit('updateLobby', lobby);

    // Connect user to lobby
    client.join(payload.id);

    // Send lobby to user
    client.emit('joinedLobby', lobby);
  }

  @SubscribeMessage('startPickBan')
  handleStartPickBan(client, payload: { id: string }) {
    let lobby = this.lobbies.find((lobby) => lobby.id === payload.id);
    if (!lobby) {
      client.emit('error', 'Lobby Not Found');
      return;
    }
    if (lobby.adminId !== client.id) {
      client.emit('error', 'You are not the admin');
      return;
    }
    if (lobby.started) {
      client.emit('error', 'Lobby already started');
      return;
    }
    if (lobby.teamA.length !== lobby.teamB.length) {
      client.emit('error', 'Teams are not equal');
      return;
    }
    // Reset lobby
    this.resetLobby(lobby);

    lobby.started = true;
    lobby.phase = 'ban';
    lobby.turn = 'teamA';
    lobby.turnClientId = lobby.teamA_Captain.id;
    lobby.turnStartedAt = new Date();
    // lobby ends after startedAt + 30 seconds
    lobby.turnEndsAt = new Date(lobby.turnStartedAt.getTime() + 30000);

    this.io.to(payload.id).emit('startPickBan', lobby.turn);
  }

  @SubscribeMessage('banItem')
  handleBanItem(client, payload: { id: string; item: LobbyItem }) {
    let lobby = this.lobbies.find((lobby) => lobby.id === payload.id);
    let error = this.lobbyChecker(client.id, payload.item.name, lobby);
    if (error) {
      client.emit('error', error);
      return;
    }

    // Check if all bans are done
    if (
      lobby.banSize * 2 <= lobby.bannedItems.length ||
      lobby.phase !== 'ban'
    ) {
      client.emit('error', 'All bans are done');
      return;
    }

    lobby = this.switchTurn(lobby);
    lobby.bannedItems.push(payload.item);

    // Emit the banned item to the lobby
    this.io.to(payload.id).emit('banItem', payload.item);

    // Check if all bans are done and switch to pick phase
    if (lobby.banSize * 2 === lobby.bannedItems.length) {
      // Switch to pick phase and turn to team A
      lobby.phase = 'pick';
      lobby.turn = 'teamA';
      // Attach turnClientId to 1st player in team A
      lobby.turnClientId = lobby.teamA[0].id;
      this.io.to(payload.id).emit('startPickPhase', lobby.turn);
      return;
    }

    // Emit the next turn to the lobby
    this.io.to(payload.id).emit('nextBanTurn', {
      turn: lobby.turn,
      turnClientId: lobby.turnClientId,
    });
  }

  @SubscribeMessage('pickItem')
  handlePickItem(client, payload: { id: string; item: LobbyItem }) {
    let lobby = this.lobbies.find((lobby) => lobby.id === payload.id);

    let error = this.lobbyChecker(client.id, payload.item.name, lobby);
    if (error) {
      client.emit('error', error);
      return;
    }

    lobby = this.switchTurn(lobby);
    lobby.pickedItems.push(payload.item);

    // Emit the picked item to the lobby
    this.io.to(payload.id).emit('pickItem', payload.item);

    // Check if all picks are done and lobby is done
    if (lobby.pickSize === lobby.pickedItems.length) {
      lobby.started = false;
      lobby.phase = 'done';
      this.io.to(payload.id).emit('lobbyDone', lobby);
      return;
    }

    // Emit the next turn to the lobby
    this.io.to(payload.id).emit('nextPickTurn', {
      turn: lobby.turn,
      turnClientId: lobby.turnClientId,
    });
  }
  // TEST ITEM WILL BE DELETED
  @SubscribeMessage('getlobby')
  handleGetLobby(client, payload: { id: string }) {
    let lobby = this.lobbies.find((lobby) => lobby.id === payload.id);
    console.log(lobby);
  }

  // ---------------------------------------------- //
  // ----------------- FUNCTIONAL ----------------- //
  // ---------------------------------------------- //

  // ----------------- SWITCH TURN LOGIC ----------------- //

  switchTurn(lobby: Lobby) {
    lobby.turn = lobby.turn === 'teamA' ? 'teamB' : 'teamA';
    lobby.turnClientId = lobby[lobby.turn + '_Captain'].id;
    lobby.turnStartedAt = new Date();
    // lobby ends after startedAt + 30 seconds
    lobby.turnEndsAt = new Date(lobby.turnStartedAt.getTime() + 30000);
    return lobby;
  }

  // ----------------- TURN TIMER ----------------- //

  checkTurnTimer() {
    for (let lobby of this.lobbies) {
      if (!lobby.started) continue;

      if (lobby.turnEndsAt.getTime() < new Date().getTime()) {
        // If turn phase is pick, cancel ban/pick and reset lobby
        if (lobby.phase === 'pick') {
          //find user from teams with id
          let user = lobby.teamA.find((user) => user.id === lobby.turnClientId);
          if (!user) {
            user = lobby.teamB.find((user) => user.id === lobby.turnClientId);
          }

          this.io
            .to(lobby.id)
            .emit('cancelPickBan', `${user.username} did not pick!`);

          // Reset lobby
          lobby = this.resetLobby(lobby);

          this.io.to(lobby.id).emit('resetLobby', lobby);
          return;
        }

        lobby.bannedItems.push({
          name: 'Not selected',
          image: '',
        });
        let _lobby = this.switchTurn(lobby);

        this.io
          .to(lobby.id)
          .emit('message', `${lobby.turnClientId} did not ban!`);

        // Emit the next turn to the lobby
        this.io.to(lobby.id).emit('nextBanTurn', _lobby.turn);
      }
    }
    // Recall this every 1 second
    setTimeout(() => this.checkTurnTimer(), 1000);
  }

  // ----------------- RESET LOBBY ----------------- //
  resetLobby(lobby: Lobby) {
    lobby.started = false;
    lobby.phase = 'ban';
    lobby.turn = 'teamA';
    lobby.turnClientId = lobby.teamA_Captain.id;
    lobby.turnStartedAt = null;
    lobby.turnEndsAt = null;
    lobby.pickedItems = [];
    lobby.bannedItems = [];
    return lobby;
    // this.io.to(lobby.id).emit('resetLobby', lobby);
  }

  // ----------------- LOBBY CONTROLS ----------------- //
  lobbyChecker(clientId: string, itemId: string, lobby: Lobby) {
    // Check if lobby exists
    if (!lobby) {
      return 'Lobby Not Found';
    }

    // Check if user is in the lobby
    if (
      !lobby.teamA.find((e) => e.id === clientId) &&
      !lobby.teamB.find((e) => e.id === clientId)
    ) {
      return 'User not in lobby';
    }

    // Check if lobby is started
    if (!lobby.started) {
      return 'Lobby not started';
    }

    //  Check lobby turn
    let team = lobby.teamA.find((e) => e.id === clientId) ? 'teamA' : 'teamB';
    if (lobby.turn !== team || lobby.turnClientId !== clientId) {
      return 'Not your turn';
    }

    // Check if item is valid
    //  Not yet implemented

    // Check if item is already picked
    if (lobby.pickedItems.find((e) => e.name === itemId)) {
      return 'Item already picked';
    }

    // Check if item is banned
    if (lobby.bannedItems.find((e) => e.name === itemId)) {
      return 'Item is banned';
    }

    return null;
  }
}
