# node-socket-deli
A wrapper around the standard net socket and server of node.js which adds packet delimiter, size and crc32 check

Use like the standard ones, except there is one more event called 'message' which is emitted when 
a packet is received that contained a valid delimiter header.

# Install
```
shell$ npm install node-socket-deli
```
# Usage

## Server

```javascript
var PORT = 6969;
var server = new require('socket-deli').Server(PORT);

server.on('connection', function(socket){
    console.log('connected with ' + socket.remoteAddress + ':' + socket.remotePort);
    var message = {};
    message.info = 'Hello World from server';
    socket.writeJsonMessage(message);
});

server.listen(PORT);
```

## Client

```javascript
var socket = new require('socket-deli').Socket();
var PORT = 6969;

socket.on('message',function(message){
    // message is a binary buffer
    var jsonMessage = JSON.parse(message);
    console.log(jsonMessage);
});

socket.connect(PORT, function(){
    console.log('connected');
    var message = {};
    message.info = 'Hello World from client';
    socket.writeJsonMessage(message);
})
```