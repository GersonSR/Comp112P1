var socket = io();
socket.on('state', function(data) {
  console.log(data);
});