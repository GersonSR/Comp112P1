// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
var app = express();
var server = http.Server(app);
var io = socketIO(server);
app.set('port', 5000);
app.use('/static', express.static(__dirname + '/static'));
// Routing
app.use(express.static('public'));
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname+'/index.html'));
});
// Starts the server.
server.listen(5000, function() {
  console.log('Starting server on port 5000');
});

var gameState = {};
	gameState['dt'] = 0;
	gameState['blocks'] = 0;
	gameState['rows'] = 0;
	gameState['score'] = 0;
	gameState['current'] = 0;
	gameState['next'] = 0;
	gameState['step'] = 0;

console.log(gameState);

setInterval(function() {
  io.sockets.emit('state', gameState);
}, 1000 / 60);