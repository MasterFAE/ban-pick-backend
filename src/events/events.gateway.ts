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
      * When switching sides team captains must be changed if switching user is the captain
      * When captain switches side change captain of the other team
      * Team switching only be available when lobby is started: false
      [x] Lobby pick/ban time control
      [x] Check if user is in the lobby before banning/picking
      [x] Need a simulation mode: 
        - For example, in League Of Legends lobby if simulation mode is on,
          teams will be filled with made-up players like {id: 1, username: 'Player 1'}, {id: 2, username: 'Player 2'} etc.  
        - And user will decide every pick and ban by switching sides?

  */
  @SubscribeMessage('createLobby')
  handleNewLobby(
    client,
    payload: {
      id: string;
      userName: string;
      game: string;
      name: string;
      map: string;
      mode: string;
      password: string;
      simulation: boolean;
    },
  ) {
    let lobby: any = {
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

    switch (payload.game) {
      case 'League of Legends':
        lobby.teamSize = 5;
        lobby.pickSize = 5;
        lobby.banSize = 5;
        break;

      case 'Counter Strike: Global Offensive':
        lobby.teamSize = 5;
        lobby.pickSize = 5;
        lobby.banSize = 2;
        break;

      case 'Valorant':
        lobby.teamSize = 5;
        lobby.pickSize = 5;
        lobby.banSize = 2;
        break;

      default:
        lobby.teamSize = 5;
        lobby.pickSize = 5;
        lobby.banSize = 5;
        break;
    }

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

    if (lobby.simulation) {
      client.emit('error', 'Simulation mode is on');
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
    if (lobby.teamA.length !== lobby.teamB.length && !lobby.simulation) {
      client.emit('error', 'Teams are not equal');
      return;
    }
    // Reset lobby
    this.resetLobby(lobby);

    // LOGIC: Set lobby options
    lobby.started = true;
    lobby.phase = 'ban';
    lobby.turn = 'teamA';
    lobby.turnClientId = lobby.teamA_Captain.id;
    lobby.turnStartedAt = new Date();
    // lobby ends after startedAt + 30 seconds
    lobby.turnEndsAt = new Date(lobby.turnStartedAt.getTime() + 30000);

    // Simulation mode, fill teams with made-up players
    if (lobby.simulation) {
      lobby.teamA = [];
      lobby.teamB = [];
      for (let i = 0; i < lobby.teamSize; i++) {
        let randomName = i + Math.floor(Math.random() * 100);

        lobby.teamA.push({
          id: 'A_sim_player' + randomName,
          username: 'A Team Player ' + randomName,
        });
        lobby.teamB.push({
          id: 'B_sim_player' + randomName,
          username: 'B Team Player ' + randomName,
        });
      }
    }

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
    if (lobby.banSize * 2 <= lobby.bannedItems.length) {
      client.emit('error', 'All bans are done');
      return;
    }
    if (lobby.phase !== 'ban') {
      client.emit('error', 'Ban phase is over');
      return;
    }
    lobby = this.switchTurn(lobby);
    lobby.bannedItems.push(payload.item);

    // Emit the banned item to the lobby
    this.io.to(payload.id).emit('banItem', payload.item);

    // Check if all bans are done and switch to pick phase
    if (lobby.turnNo == 7) {
      // Switch to pick phase and turn to team A
      lobby.phase = 'pick';
      lobby.turn = 'teamA';
      // Attach turnClientId to 1st player in team A
      lobby.turnClientId = lobby.simulation ? lobby.adminId : lobby.teamA[0].id;
      this.io.to(payload.id).emit('startPickPhase', lobby.turn);
      return;
    } else if (lobby.turnNo == 17) {
      // Switch to pick phase and turn to team A
      lobby.phase = 'pick';
      lobby.turn = 'teamB';
      // Attach turnClientId to 1st player in team A
      lobby.turnClientId = lobby.simulation ? lobby.adminId : lobby.teamB[3].id;
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

    // Check if all bans are done
    if (lobby.pickSize * 2 <= lobby.pickedItems.length) {
      client.emit('error', 'All picks are done');
      return;
    }
    if (lobby.phase !== 'pick') {
      client.emit('error', 'Pick phase is over');
      return;
    }

    // decide which team to pick
    let team = lobby.turn === 'teamA' ? lobby.teamA : lobby.teamB;

    // Switch turn
    lobby = this.switchTurn(lobby);

    // Add picked item to lobby
    lobby.pickedItems.push(payload.item);

    // Find the user who picked the item
    // Or if in simulation mode, find the user who has not picked yet
    let user = lobby.simulation
      ? team.find((user) => !user.picked)
      : team.find((user) => user.id === client.id);
    user.picked = payload.item;

    // Emit the picked item to the lobby
    this.io.to(payload.id).emit('pickItem', payload.item);

    // Check if all picks are done and lobby is done
    if (lobby.pickSize * 2 === lobby.pickedItems.length) {
      lobby.started = false;
      lobby.phase = 'done';
      this.io.to(payload.id).emit('lobbyDone', lobby);
      return;
    }

    // Check if all bans are done and switch to pick phase
    if (lobby.turnNo == 13) {
      // Switch to pick phase and turn to team A
      lobby.phase = 'ban';
      lobby.turn = 'teamB';
      // Attach turnClientId to 1st player in team A
      lobby.turnClientId = lobby.simulation
        ? lobby.adminId
        : lobby.teamB_Captain.id;
      this.io.to(payload.id).emit('startBanPhase', lobby.turn);
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
  // implement logic per game to switch turns
  switchTurn(lobby: Lobby) {
    lobby.turnNo += 1;
    switch (lobby.game) {
      case 'League Of Legends':
        if (lobby.phase === 'pick') {
          if (
            lobby.turnNo === 7 ||
            lobby.turnNo === 10 ||
            lobby.turnNo === 11 ||
            lobby.turnNo === 18 ||
            lobby.turnNo === 19
          ) {
            lobby.turn = 'teamA';
            // returns undefined because test only includes 1 player per team
            // needs testing with 5v5
            // Simulation mode condition
            lobby.turnClientId = lobby.simulation
              ? lobby.adminId
              : lobby.teamA.find((e) => !e.picked).id;
          } else {
            lobby.turn = 'teamB';
            lobby.turnClientId = lobby.simulation
              ? lobby.adminId
              : lobby.teamB.find((e) => !e.picked).id;
          }
        } else {
          lobby.turn = lobby.turn === 'teamA' ? 'teamB' : 'teamA';
          lobby.turnClientId = lobby.simulation
            ? lobby.adminId
            : lobby[lobby.turn + '_Captain'].id;
        }
        break;
      case 'Valorant':
        // not yet implemented
        break;

      case 'Counter Strike: Global Offensive':
        // not yet implemented
        break;

      default:
        this.resetLobby(lobby);
        this.io.to(lobby.id).emit('error', 'Game not found');
        break;
    }

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
          avatarUrl: '',
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
    lobby.turnNo = 1;
    return lobby;
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
      !lobby.teamB.find((e) => e.id === clientId) &&
      clientId !== lobby.adminId
    ) {
      return 'User not in lobby';
    }

    // Check if lobby is started
    if (!lobby.started) {
      return 'Lobby not started';
    }

    //  Check lobby turn
    let team = lobby.teamA.find((e) => e.id === clientId) ? 'teamA' : 'teamB';
    if (
      (lobby.turn !== team || lobby.turnClientId !== clientId) &&
      // Simulation mode condition
      lobby.simulation &&
      clientId !== lobby.adminId
    ) {
      return 'Not your turn';
    }

    // Check if item is valid
    //  Not yet implemented

    // Check if item is already picked
    // if (lobby.pickedItems.find((e) => e.name === itemId)) {
    //   return 'Item already picked';
    // }

    // // Check if item is banned
    // if (lobby.bannedItems.find((e) => e.name === itemId)) {
    //   return 'Item is banned';
    // }

    return null;
  }
}
