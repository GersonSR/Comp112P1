var socket = io();
socket.on('state', function(data) {
  console.log("Game state is " + data);
});
