const express = require('express');
const path = require('path');
const app = express();

const server = require('http').Server(app);
const io = require('socket.io')(server);

const Ball = require('./../lib/Ball.js');
const Wall = require('./../lib/Wall.js');
const Room = require('./../lib/Room.js');
const Player = require('./../lib/Player.js');
const c = require('./../lib/constants.js');

const rooms = [];
const intervals = {};

function getRoomWithId(roomId) {
	for (const room of rooms) {
		if (room.id === roomId) {
			return room;
		}
	}
	return null;
}

function getCurrentRoomOfSocket(socket) {
	const roomId = socket.rooms[Object.keys(socket.rooms)[1]]; // socket.room contains [<id of room 1>, <name of room 1>, ...]
	return getRoomWithId(roomId);
}

function removeRoom(roomId) {
	for (let i=0; i < rooms.length; i++) {
		if (rooms[i].id === roomId) {
			rooms.splice(i, 1);
		}
	}
}

function moveBotPaddlesInRoom(room) {
	const botPaddles = room.getBotPaddles();
	for (const paddle of botPaddles) {
		paddle.moveBot();
	}
}

io.on('connection', function(socket) {
	console.log(socket.id, "connected!");

	socket.on('join pending', function(roomName) {
		const roomToJoin = getRoomWithId(roomName);
		
		if (roomToJoin && roomToJoin.isFull()) {
			if (roomToJoin.isFull()) {
				socket.emit('join failure');
			} else {
				socket.emit('join success');
				socket.join(roomName);
			}
		} else { // Room does not exist
			socket.emit('join success');
			socket.join(roomName);

			const newRoom = new Room(roomName);
			intervals[roomName] = [];
			
			// Add room to list of rooms
			rooms.push(newRoom);
		}
	});

	socket.on('new player', function() {
		const currentRoom = getCurrentRoomOfSocket(socket);
		if (!currentRoom) return;

		// Create a new player 
		const playerNo = currentRoom.getNumberOfPlayers() + 1;
		const newPlayer = new Player(playerNo);

		// Add player to the room's list of players
		currentRoom.players[socket.id] = newPlayer;

		// Only host can choose to verse bots
		if (playerNo === 1) {
			socket.emit('host');
		}

		// Start the game when the room has 4 players
		if (currentRoom.getNumberOfPlayers() === 4) {
			currentRoom.startGame();
			socket.in(currentRoom.id).emit('game start');
		}
	});

	socket.on('disconnecting', function() {
		console.log(socket.id, "disconnecting!");
		const currentRoom = getCurrentRoomOfSocket(socket);
		if (currentRoom) {
			// Game in room is no longer valid
			currentRoom.stopGame();

			// Tell client to redisplay everyone's screen in this room
			socket.to(currentRoom.id).emit('restart');

			// Stop sending state
			const roomIntervals = intervals[currentRoom.id];
			for (const interval of roomIntervals) {
				clearInterval(interval);
			}

			// Remove this room
			removeRoom(currentRoom.id);

			// Force each connected client in room to leave
			const socketsInRoom = io.sockets.adapter.rooms[currentRoom.id].sockets;
			let firstSocket;
			while (firstSocket = Object.keys(socketsInRoom)[0]) {
				io.sockets.connected[firstSocket].leave(currentRoom.id);
			}
		}
	});

	socket.on('player move', function(mousePos) {
		const currentRoom = getCurrentRoomOfSocket(socket);
		if (currentRoom) {
			const player = currentRoom.players[socket.id];
			if (player) {
				const paddle = player.getPaddle();
				if (paddle) {
					paddle.followMouse(mousePos);
				}	
			}
		}
	});

	socket.on('ball move', function(timeDifference) {
		const currentRoom = getCurrentRoomOfSocket(socket);

		if (currentRoom) {
			const ball = currentRoom.ball;
			if (ball) {
				const walls = currentRoom.walls;

				// Change ball direction if ball collides with wall
				for (const wall of walls) {
					const collides = ball.collidesWithWall(wall);
					if (collides) {
						if (ball.collidesAtCorner) {
							const angle = (360 * Math.random()) * (Math.PI/180);
							ball.vx = ball.vx * -1 * Math.sin(angle);
							ball.vy = ball.vy * -1 * c.BALL_INITIAL_VY * Math.cos(angle);
							ball.collidesAtCorner = false;
						} else if (ball.isInBottomGoal() || ball.isInTopGoal()) {
							ball.vx *= -1;
						} else if (ball.isInLeftGoal() || ball.isInRightGoal()) {
							ball.vy *= -1;
						}
						break;
					}
				}

				// Change ball direction if ball collides with paddle
				const players = currentRoom.players;
				for (const socket in players) {
					if (players.hasOwnProperty(socket)) {
						const paddle = players[socket].getPaddle();
						if (ball.collidesWithPaddle(paddle)) {
							// First collision with paddle
							if (!ball.currentlyCollidedWithPaddle) {
								ball.changeDirectionOnCollisionWith(paddle);
							}
							break;
						} else {
							if (paddle.playerNo === ball.playerNoOfPaddleCollidedWith) {
								ball.currentlyCollidedWithPaddle = false;
							}
						}
					}
				}

				// Increment score if ball passed goal
				for (const socket in players) {
					if (players.hasOwnProperty(socket)) {
						const goal = players[socket].getGoal();
						if (ball.outOfBounds(goal)) {
							if (ball.alreadyPastGoal) {
								ball.reset();
							} else {
								if (ball.playerNoOfPaddleCollidedWith) {
									const playerToIncrScore = currentRoom.getPlayerWithPlayerNo(ball.playerNoOfPaddleCollidedWith);
									playerToIncrScore.incrScore();
									ball.playerNoOfPaddleCollidedWith = undefined;
								}
								ball.alreadyPastGoal = true;
							}
						}
					}
				}

				ball.x += ball.vx;
				ball.y += ball.vy;
			}
		}
	});

	socket.on('verse bots', function() {
		const currentRoom = getCurrentRoomOfSocket(socket);
		const currentNumOfPlayers = currentRoom.getNumberOfPlayers();

		for (let i=currentNumOfPlayers+1; i <= 4; i++) {
			const newPlayer = new Player(i);
			const fakeSocket = "bot" + (i);
			currentRoom.players[fakeSocket] = newPlayer;
		}
		currentRoom.startGame();
		if (currentNumOfPlayers === 1) {
			socket.emit('game start');
		} else {
			socket.in(currentRoom.id).emit('game start');
		}
	});

	let interval = setInterval(function() {
		const currentRoom = getCurrentRoomOfSocket(socket);

		if (currentRoom) {
			if (!intervals[currentRoom.id].includes(interval)) {
				intervals[currentRoom.id].push(interval);
			}

			const ball = currentRoom.ball;
			const walls = currentRoom.walls;
			const players = currentRoom.players;

			if (currentRoom.gameActive) {
				currentRoom.updateTime();
				if (currentRoom.currentTime <= -1) {
					currentRoom.stopGame();

					// Send winners
					const winners = currentRoom.getWinners();
					io.sockets.in(currentRoom.id).emit('game over', winners);

					// Stop sending state
					const roomIntervals = intervals[currentRoom.id];
					for (const interval of roomIntervals) {
						clearInterval(interval);
					}
					return;
				}
			}

			const time = currentRoom.currentTime;
			moveBotPaddlesInRoom(currentRoom);
			io.sockets.in(currentRoom.id).emit('state', {ball, walls, players, time});
		}
	}, 1000 / 60);
});

const port = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, '../../dist');
const HTML_FILE = path.join(DIST_DIR, 'index.html');

app.use(express.static(DIST_DIR));

app.get('/', (req, res) => {
	res.sendFile(HTML_FILE);
});

server.listen(port, function() {
	console.log('App listening on port: ' + port);
});
