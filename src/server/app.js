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
let vx = 6;
let vy = 6;

function moveBotPaddlesInRoom(room) {
	const botPaddles = room.getBotPaddles();
	for (const paddle of botPaddles) {
		let newX = paddle.x;
		let newY = paddle.y;
		switch (paddle.playerNo) {
			case 1:
			case 2:
				newY += vy;
				break;
			case 3:
				newX += (vx * -1);
				break;
			case 4:
				newX += vx;
				break;
		}
		const posOfNext = {x: newX, y: newY};
		const reverse = paddle.followMouse(posOfNext);
		if (reverse) {
			vx *= -1;
			vy *= -1;
		}
	}
}

io.on('connection', function(socket) {
	console.log(socket.id, "connected!");

	socket.on('join pending', function(roomName) {
		const roomToJoin = getRoomWithId(roomName);
		
		if (roomToJoin && roomToJoin.isFull()) { // Room exists
			if (roomToJoin.isFull()) {
				console.log('someone tried to join full room');
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

			// Remove this room and force everyone to leave
			const socketsInRoom = io.sockets.adapter.rooms[currentRoom.id].sockets;
			let firstSocket;
			while (firstSocket = Object.keys(socketsInRoom)[0]) {
				console.log("client leaves room");
				io.sockets.connected[firstSocket].leave(currentRoom.id);
				removeRoom(currentRoom.id);
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
						console.log("ball collides with wall");
						if (ball.collidesAtCorner) {
							console.log("ball collides at corner");
							ball.vx *= -1;
							ball.vy *= -1;
						} else if (ball.isInBottomGoal() || ball.isInTopGoal()) {
							console.log("ball in bottom or top goal");
							ball.vx *= -1;
						} else if (ball.isInLeftGoal() || ball.isInRightGoal()) {
							console.log("ball in left or right goal");
							ball.vy *= -1;
						} else {
							console.log("ball collided but is not in any goal");
						}
						break;
					}
				}

				// Change ball direction if ball collides with paddle
				const players = currentRoom.players;
				for (const key in players) {
					if (players.hasOwnProperty(key)) {
						const paddle = players[key].getPaddle();
						if (ball.collidesWithPaddle(paddle)) {
							if (!ball.currentlyCollidedWithPaddle) {
								console.log("ball collides with paddle for the first time", paddle.playerNo);
								switch (paddle.playerNo) {
									case 1:
									case 2:
										ball.vx *= -1;
										break;
									case 3:
									case 4:
										ball.vy *= -1;
								}
								ball.currentlyCollidedWithPaddle = true;
								ball.playerNoOfPaddleCollidedWith = paddle.playerNo;
								ball.color = paddle.color;
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
				for (const key in players) {
					if (players.hasOwnProperty(key)) {
						const goal = players[key].getGoal();
						if (ball.outOfBounds(goal)) {
							if (ball.alreadyPastGoal) {
								// Reset the ball
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
					const winners = currentRoom.getWinners();
					io.sockets.in(currentRoom.id).emit('game over', winners);
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
