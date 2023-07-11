## Pick & Ban App - Back End

This is a backend application for a competitive game lobby system, designed for League of Legends, CS:GO, and Valorant. The application provides features for banning and selecting characters or maps in a competitive game setting. It is built using TypeScript, Socket.IO, and NestJS.

## Features

- Ban phase: Allows players to ban unique characters or maps before the game starts.
- Selection phase: Allows players to unique characters or maps for their team.
- Real-time updates: Provides real-time updates to all connected players, reflecting the current state of the lobby.

## Supported Games

- League of Legends - Champion Select & Ban System

  - Team A starts with a ban and when Team A and Team B both have 3 bans, first pick phase starts.
  - Each team picks 3 champion at this phase ordered with:
    - 1st, 4th, 5th picks belongs to Team A
    - 2nd, 3rd, 6th pick belongs to Team B.
  - After the first pick phase, second ban phase starts with Team B and when both team ban 2 more champions last pick phase starts.
  - At the last pick phase ordered with:
    - 1st and 4th picks belongs to Team B
    - 2nd and 3rd picks belongs to Team A
  - In the end, both of the teams banned 5 and picked 5 unique champions.

  Source: [TCL - Turkish Championship League](https://liquipedia.net/leagueoflegends/TCL)

- Valorant - Map Select & Ban System
  WILL BE AVAILABLE SOON

- Counter-Strike: Global Offensive - Map Select & Ban System
  WILL BE AVAILABLE SOON

## Acknowledgements

- [NestJS](https://nestjs.com) - A progressive Node.js framework for building efficient, scalable, and reliable server-side applications.
- [Socket.IO](https://socket.io) - A JavaScript library for real-time web applications.
- [League of Legends](https://leagueoflegends.com)
- [CS:GO](https://counter-strike.net)
- [Valorant](https://playvalorant.com)

## Made by fAemeister

- LinkedIn - [Sinan Gürcan](https://www.linkedin.com/in/sinan-gurcan/)
