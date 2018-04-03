// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
var app = express();
var server = http.Server(app);
var io = socketIO(server);

app.set('port', (process.env.PORT || 5000));

app.use('/static', express.static(__dirname + '/static'));
// Routing
app.use(express.static('public'));
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname+'/index.html'));
});
// Starts the server.
server.listen((process.env.PORT || 5000), function() {
  console.log('Starting server on port 5000');
});

function timestamp()           { return new Date().getTime();                             }
function random(min, max)      { return (min + (Math.random() * (max - min)));            }
function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }

// -----------------------------------------------------------------------
//
// Game State Code
//
//------------------------------------------------------------------------

var dx, dy,        // pixel size of a single tetris block
    blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
    actions,       // queue of user actions (inputs)
    playing,       // true|false - game is in progress
    dt,            // time since starting this game
    current,       // the current piece
    next,          // the next piece
    score,         // the current score
    vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
    rows,          // number of completed rows in the current game
    step;          // how long before current piece drops by 1 row
var state = {};

var FRAME_RATE = 1000.0/60.0;
// Shared constants with client
var KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 },
    DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 },
    nx      = 10,
    ny      = 20;
var i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
var j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
var l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
var o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
var s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
var t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
var z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };
speed   = { start: 0.6, decrement: 0.005, min: 0.1 }; // how long before piece drops by 1 row (seconds)

function play() { reset(); playing = true; }
function lose() { playing = false; }
function setScore(n)            { state.score = n;}
function addScore(n)            { state.score += n;}
function clearScore()           { setScore(0); }
function clearRows()            { setRows(0); }
function setRows(n)             { state.rows = n; state.step = Math.max(speed.min, speed.start - (speed.decrement*state.rows)); }
function addRows(n)             { setRows(state.rows + n); }
function getBlock(x,y)          { return (state.blocks && state.blocks[x] ? state.blocks[x][y] : null); }
function setBlock(x,y,type)     { state.blocks[x] = state.blocks[x] || []; state.blocks[x][y] = type; }
function clearBlocks()          { state.blocks = []; }
function clearActions()         { state.actions = []; }
function setCurrentPiece(piece) { state.current = piece || randomPiece(); }
function setNextPiece(piece)    { state.next    = piece || randomPiece(); }



function reset(){
  state = {};
  state.dt = 0;
  state.prev_actions = [];
  clearActions();
  clearBlocks();
  clearRows();
  clearScore();
  setCurrentPiece(state.next);
  setNextPiece();
};

function update(idt) {
  if (playing) {
    handle(state.actions.shift());
    state.dt = state.dt + idt;
    if (state.dt > state.step) {
      state.dt = state.dt - state.step;
      drop();
    }
  }
}

function handle(action) {
  switch(action) {
    case DIR.LEFT:  move(DIR.LEFT);  remember(action); break;
    case DIR.RIGHT: move(DIR.RIGHT); remember(action); break;
    case DIR.UP:    rotate();        remember(action); break;
    case DIR.DOWN:  drop();          remember(action); break;
  }
}

// Remember only the last PREV_ACTIONS_MAX actions
var PREV_ACTIONS_MAX = 6;
function remember(action){
  if (state.prev_actions.length > PREV_ACTIONS_MAX){
    state.prev_actions.shift();
  }
  state.prev_actions.push(action);
}

function move(dir) {
  var x = state.current.x, y = state.current.y;
  switch(dir) {
    case DIR.RIGHT: x = x + 1; break;
    case DIR.LEFT:  x = x - 1; break;
    case DIR.DOWN:  y = y + 1; break;
  }
  if (unoccupied(state.current.type, x, y, state.current.dir)) {
    state.current.x = x;
    state.current.y = y;
    return true;
  }
  else {
    return false;
  }
}

function rotate() {
  var newdir = (state.current.dir == DIR.MAX ? DIR.MIN : state.current.dir + 1);
  if (unoccupied(state.current.type, state.current.x, state.current.y, newdir)) {
    state.current.dir = newdir;
  }
}

function drop() {
  if (!move(DIR.DOWN)) {
    addScore(10);
    dropPiece();
    removeLines();
    setCurrentPiece(next);
    setNextPiece(randomPiece());
    clearActions();
    if (occupied(state.current.type, state.current.x, state.current.y, state.current.dir)) {
      lose();
    }
  }
}

function dropPiece() {
  eachblock(state.current.type, state.current.x, state.current.y, state.current.dir, function(x, y) {
    setBlock(x, y, state.current.type);
  });
}

function removeLines() {
  var x, y, complete, n = 0;
  for(y = ny ; y > 0 ; --y) {
    complete = true;
    for(x = 0 ; x < nx ; ++x) {
      if (!getBlock(x, y))
        complete = false;
    }
    if (complete) {
      removeLine(y);
      y = y + 1; // recheck same line
      n++;
    }
  }
  if (n > 0) {
    addRows(n);
    addScore(100*Math.pow(2,n-1)); // 1: 100, 2: 200, 3: 400, 4: 800
  }
}

function removeLine(n) {
  var x, y;
  for(y = n ; y >= 0 ; --y) {
    for(x = 0 ; x < nx ; ++x)
      setBlock(x, y, (y == 0) ? null : getBlock(x, y-1));
  }
}

//------------------------------------------------
// do the bit manipulation and iterate through each
// occupied block (x,y) for a given piece
//------------------------------------------------
function eachblock(type, x, y, dir, fn) {
  var bit, result, row = 0, col = 0, blocks = type.blocks[dir];
  for(bit = 0x8000 ; bit > 0 ; bit = bit >> 1) {
    if (blocks & bit) {
      fn(x + col, y + row);
    }
    if (++col === 4) {
      col = 0;
          ++row;
    }
  }
}

//-----------------------------------------------------
// check if a piece can fit into a position in the grid
//-----------------------------------------------------
function occupied(type, x, y, dir) {
  var result = false
  eachblock(type, x, y, dir, function(x, y) {
    if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y))
      result = true;
  });
  return result;
}

function unoccupied(type, x, y, dir) {
  return !occupied(type, x, y, dir);
}

//-----------------------------------------
// start with 4 instances of each piece and
// pick randomly until the 'bag is empty'
//-----------------------------------------
var pieces = [];
function randomPiece() {
  if (pieces.length == 0)
    pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
  var type = pieces.splice(random(0, pieces.length-1), 1)[0];
  return { type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
}

// End of Game Code -----------------------------------
var last = now = timestamp();
setInterval(function() {
  if (!playing) {
    reset();
    play();
  }
  now = timestamp();
  update(Math.min(1, (now - last) / 1000.0));
  last = now;
}, FRAME_RATE);

setInterval(function() {
  io.sockets.emit('state', state);
}, FRAME_RATE);

// Capture User Input ----------------------------------

io.on('connection', function(socket) {
	socket.on('keyPress', function(data) {
		var keyNum = data;
		state.actions.push(keyNum);
	});
});
