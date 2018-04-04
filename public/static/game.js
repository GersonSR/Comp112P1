
     //-------------------------------------------------------------------------
     // base helper methods
     //-------------------------------------------------------------------------

     function get(id)        { return document.getElementById(id);  }
     function hide(id)       { get(id).style.visibility = 'hidden'; }
     function show(id)       { get(id).style.visibility = null;     }
     function html(id, html) { get(id).innerHTML = html;            }

     function timestamp()           { return new Date().getTime();                             }
     function random(min, max)      { return (min + (Math.random() * (max - min)));            }
     function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }

     if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
       window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
                                      window.mozRequestAnimationFrame    ||
                                      window.oRequestAnimationFrame      ||
                                      window.msRequestAnimationFrame     ||
                                      function(callback, element) {
                                        window.setTimeout(callback, 1000 / 60);
                                      }
     }




     //-------------------------------------------------------------------------
     // game constants
     //-------------------------------------------------------------------------

     var KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 },
         DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 },
         stats   = new Stats(),
         canvas  = get('canvas'),
         ctx     = canvas.getContext('2d'),
         ucanvas = get('upcoming'),
         uctx    = ucanvas.getContext('2d'),
         pcanvas = get('prev_actions'),
         pctx    = pcanvas.getContext('2d'),
         speed   = { start: 0.6, decrement: 0.005, min: 0.1 }, // how long before piece drops by 1 row (seconds)
         nx      = 10, // width of tetris court (in blocks)
         ny      = 20, // height of tetris court (in blocks)
         nu      = 5,  // width/height of upcoming preview (in blocks)
         nkx     = 10; // number of previous actions
         last_press = 0;
         socket  = io();

     //-------------------------------------------------------------------------
     // game variables (initialized during reset)
     //-------------------------------------------------------------------------

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
         step,          // how long before current piece drops by 1 row
         prev_actions,  // previously inputted actions
         kdx;           // pixel size of a key

     //-------------------------------------------------------------------------
     // tetris pieces
     //
     // blocks: each element represents a rotation of the piece (0, 90, 180, 270)
     //         each element is a 16 bit integer where the 16 bits represent
     //         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
     //
     //             0100 = 0x4 << 3 = 0x4000
     //             0100 = 0x4 << 2 = 0x0400
     //             1100 = 0xC << 1 = 0x00C0
     //             0000 = 0x0 << 0 = 0x0000
     //                               ------
     //                               0x44C0
     //
     //-------------------------------------------------------------------------

     var i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
     var j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
     var l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
     var o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
     var s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
     var t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
     var z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };

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


     //-------------------------------------------------------------------------
     // GAME LOOP
     //-------------------------------------------------------------------------

     function run() {

       showStats(); // initialize FPS counter
       addEvents(); // attach keydown and resize events

       var last = now = timestamp();


       resize(); // setup all our sizing information
       reset();  // reset the per-game variables
       //frame();  // start the first frame
       draw();
       //play();
     }

     function showStats() {
       stats.domElement.id = 'stats';
       get('menu').appendChild(stats.domElement);
     }

     function addEvents() {
       document.addEventListener('keydown', keydown);
       window.addEventListener('resize', resize, false);
     }

     function resize(event) {
       canvas.width   = canvas.clientWidth;  // set canvas logical size equal to its physical size
       canvas.height  = canvas.clientHeight; // (ditto)
       ucanvas.width  = ucanvas.clientWidth;
       ucanvas.height = ucanvas.clientHeight;
       pcanvas.width = pcanvas.clientWidth;
       pcanvas.height = pcanvas.clientHeight;
       dx = canvas.width  / nx; // pixel size of a single tetris block
       dy = canvas.height / ny; // (ditto)
       kdx = pcanvas.width / nkx; // pixel size of key in prev actions
       invalidate();
       invalidateNext();
     }

     function keydown(ev) {
       var handled = false;
       if (playing) {
         var curr_press = Date.now();
         if(curr_press - last_press > 100){
           switch(ev.keyCode) {
               case KEY.LEFT:  socket.emit('keyPress', DIR.LEFT);  handled = true; break;
               case KEY.RIGHT: socket.emit('keyPress', DIR.RIGHT); handled = true; break;
               case KEY.UP:    socket.emit('keyPress', DIR.UP);  handled = true; break;
               case KEY.DOWN:  socket.emit('keyPress', DIR.DOWN);  handled = true; break;
           }
           last_press = curr_press;
         }else{
            handled = true;
         }
       }
       if (handled)
         ev.preventDefault(); // prevent arrow keys from scrolling the page (supported in IE9+ and all other browsers)
     }


     //-------------------------------------------------------------------------
     // GAME LOGIC
     //-------------------------------------------------------------------------
     function play() { hide('start'); reset();          playing = true;  }
     function lose() { show('start'); setVisualScore(); playing = false; }

     function setVisualScore(n)      { vscore = n || score; invalidateScore(); }
     function setScore(n)            { score = n; setVisualScore(n);  }
     function addScore(n)            { score = score + n;   }
     function clearScore()           { setScore(0); }
     function clearRows()            { setRows(0); }
     function setRows(n)             { rows = n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); invalidateRows(); }
     function addRows(n)             { setRows(rows + n); }
     function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); }
     function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidate(); }
     function clearBlocks()          { blocks = []; invalidate(); }
     function clearActions()         { actions = []; }
     function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate();     }
     function setNextPiece(piece)    { next    = piece || randomPiece(); invalidateNext(); }


     function reset() {
       dt = 0;
       prev_actions = [];
       clearActions();
       clearBlocks();
       clearRows();
       clearScore();
       setCurrentPiece(next);
       setNextPiece();
     }

     //-------------------------------------------------------------------------
     // RENDERING
     //-------------------------------------------------------------------------

     var invalid = {};

     function invalidate()         { invalid.court  = true; }
     function invalidateNext()     { invalid.next   = true; }
     function invalidateScore()    { invalid.score  = true; }
     function invalidateRows()     { invalid.rows   = true; }

     function draw() {
       ctx.save();
       ctx.lineWidth = 1;
       ctx.translate(0.5, 0.5); // for crisp 1px black lines
       drawCourt();
       drawNext();
       drawScore();
       drawRows();
       drawActions();
       ctx.restore();
     }


     function drawActions(){
       pctx.clearRect(0, 0, pcanvas.width, pcanvas.height);
       len = Math.min(nkx, prev_actions.length); // Number of keys we can fit in canvas
       var i;
       for (i = 0; i < len; i++){
         drawKey(pctx, i, prev_actions[i]);
       }
     }


     function drawKey(ctx, i, action){
       ctx.fillStyle = 'white'; // white
       ctx.fillRect(i*kdx, 0, kdx, kdx);
       ctx.strokeRect(i*kdx, 0, kdx, kdx);
       ctx.fillStyle = "red";
       ctx.font = "18px Arial";
       ctx.textAlign = "center";
       var c;
       switch(action) {
         case DIR.LEFT:  c = 8592;  break;
         case DIR.RIGHT: c = 8594;  break;
         case DIR.UP:    c = 8593;  break;
         case DIR.DOWN:  c = 8595;  break;
       }
       ctx.fillText(String.fromCharCode(c), (i*kdx) + kdx/2, kdx/2);
     }

     function drawBlock(ctx, x, y, color) {
       ctx.fillStyle = color;
       ctx.fillRect(x*dx, y*dy, dx, dy);
       ctx.strokeRect(x*dx, y*dy, dx, dy)
     }

     function drawCourt() {
       if (invalid.court) {
         ctx.clearRect(0, 0, canvas.width, canvas.height);
         if (playing){
           drawPiece(ctx, current.type, current.x, current.y, current.dir);
         }
         var x, y, block;
         for(y = 0 ; y < ny ; y++) {
           for (x = 0 ; x < nx ; x++) {
             if (block = getBlock(x,y))
               drawBlock(ctx, x, y, block.color);
           }
         }
         ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
         invalid.court = false;
       }
     }

     function drawNext() {
       if (invalid.next) {
         var padding = (nu - next.type.size) / 2; // half-arsed attempt at centering next piece display
         uctx.save();
         uctx.translate(0.5, 0.5);
         uctx.clearRect(0, 0, nu*dx, nu*dy);
         drawPiece(uctx, next.type, padding, padding, next.dir);
         uctx.strokeStyle = 'black';
         uctx.strokeRect(0, 0, nu*dx - 1, nu*dy - 1);
         uctx.restore();
         invalid.next = false;
       }
     }

     function drawScore() {
       if (invalid.score) {
         html('score', ("00000" + Math.floor(vscore)).slice(-5));
         invalid.score = false;
       }
     }

     function drawRows() {
       if (invalid.rows) {
         html('rows', rows);
         invalid.rows = false;
       }
     }

     function drawPiece(ctx, type, x, y, dir) {
       eachblock(type, x, y, dir, function(x, y) {
         drawBlock(ctx, x, y, type.color);
       });
     }

     function drawBlock(ctx, x, y, color) {
       ctx.fillStyle = color;
       ctx.fillRect(x*dx, y*dy, dx, dy);
       ctx.strokeRect(x*dx, y*dy, dx, dy)
     }

     //-------------------------------------------------------------------------
     // FINALLY, lets run the game
     //-------------------------------------------------------------------------
     var last = now = timestamp();
     function frame() {
       now = timestamp();
       //update(Math.min(1, (now - last) / 1000.0)); // using requestAnimationFrame have to be able to handle large delta's caused when it 'hibernates' in a background or non-visible tab
       if (vscore < score)
          setVisualScore(vscore + 1);
       draw();
       stats.update();
       last = now;
       requestAnimationFrame(frame, canvas);
     }
     socket.on('state', function(data) {
       dt = data.dt;
       blocks = data.blocks;
       rows = data.rows;
       score = data.score;
       current = data.current;
       next = data.next;
       step = data.step;
       prev_actions = data.prev_actions;
       //setVisualScore(score);
       invalidate();
       invalidateNext();
       invalidateRows();
       invalidateScore();
     });

     socket.on('restart', function(){
        setScore(0);
        invalidate();
        draw();
     });
     

     play();
     window.setTimeout(frame, 1000/60);
     run();