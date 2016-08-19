const net = require('net');
const util = require('util');
const debug = util.debuglog('net');
const EventEmitter = require('events');

var HEADER_BUFFER = new Buffer([ 0, 1, 1, 2, 3, 5, 8, 13, 21, 34]); // fibonacci sequence, most improbable to get it randomly
var HEADER_BUFFER_LENGTH = HEADER_BUFFER.length;
var SIZE_AND_CRC_HEADER_LENGTH = 12;
var HEADER_LENGTH = HEADER_BUFFER_LENGTH + SIZE_AND_CRC_HEADER_LENGTH;


function WrappedSocket(options,nativeSocket){
    if (!(this instanceof WrappedSocket)) return new WrappedSocket(options);
    this._netSocket = nativeSocket || new net.Socket(options);
    this._netSocket.on('data', accumulateBuffer)
}

function protoGetter(name, callback) {
  Object.defineProperty(WrappedSocket.prototype, name, {
    configurable: false,
    enumerable: true,
    get: callback
  });
}

protoGetter('bytesRead', function bytesRead() {
  return this.bytesRead;
});

protoGetter('remoteAddress', function remoteAddress() {
  return this._netSocket.remoteAddress;
});

protoGetter('remoteFamily', function remoteFamily() {
  return this._netSocket.remoteFamily;
});

protoGetter('remotePort', function remotePort() {
  return this._netSocket.remotePort;
});

WrappedSocket.prototype._getsockname = function() {
  return this._netSocket._getsockname;
};

protoGetter('localAddress', function localAddress() {
  return this._netSocket.localAddress;
});

protoGetter('localPort', function localPort() {
  return this._netSocket.localPort;
});

WrappedSocket.prototype.on = function(event,callback){
    this._netSocket.on(event,callback);
}

WrappedSocket.prototype.connect = function(options, cb){
    return this._netSocket.connect(options,cb);
}

WrappedSocket.prototype.read = function(n) {
    return this._netSocket.read(n);
};

WrappedSocket.prototype.listen = function() {
    return this._netSocket.listen(arguments);
};

WrappedSocket.prototype.setTimeout = function(msecs, callback) {
  return this._netSocket.setTimeout(msecs, callback); 
};

WrappedSocket.prototype._onTimeout = function() {
  return this._netSocket._onTimeout();
};

WrappedSocket.prototype.setNoDelay = function(enable) {
  return this._netSocket.setNoDelay(enable);
};

WrappedSocket.prototype.setKeepAlive = function(setting, msecs) {
  return this._netSocket.setKeepAlive(setting,msecs);
};

WrappedSocket.prototype.address = function() {
  return this._netSocket.address();
};

Object.defineProperty(WrappedSocket.prototype, '_connecting', {
  get: function() {
    return this._netSocket.connecting;
  }
});

Object.defineProperty(WrappedSocket.prototype, 'readyState', {
  get: function() {
    return this._netSocket.readyState;
  }
});

Object.defineProperty(WrappedSocket.prototype, 'bufferSize', {
  get: function() {
    return this._netSocket.bufferSize;
  }
});

WrappedSocket.prototype.end = function(data, encoding) {
  return this._netSocket.end(data,encoding);
};

WrappedSocket.prototype.write = function(chunk, encoding, cb) {
  return this._netSocket.write(chunk,encoding,cb);
};

WrappedSocket.prototype.writeJsonMessage = function(message){
    var messageBuffer = new Buffer(JSON.stringify(message));
    this.writeBinaryMessage(messageBuffer);
}

WrappedSocket.prototype.writeMessage = WrappedSocket.prototype.writeJsonMessage;

WrappedSocket.prototype.writeBinaryMessage = function(messageBuffer){
    var finalBuffer = new Buffer(HEADER_LENGTH + messageBuffer.length);
    HEADER_BUFFER.copy(finalBuffer,0, 0,HEADER_BUFFER_LENGTH);
    finalBuffer.writeUIntLE(messageBuffer.length, HEADER_BUFFER_LENGTH, 6);
    var checksum = (crc32(messageBuffer));
    finalBuffer.writeUIntLE(checksum, HEADER_BUFFER_LENGTH + 6, 6);
    messageBuffer.copy(finalBuffer, HEADER_LENGTH, 0, messageBuffer.length);
    this._netSocket.write(finalBuffer);
    debug('SEND:' + finalBuffer);
}

function accumulateBuffer(data){
    if (typeof this.socketBuffer === 'undefined')
        this.socketBuffer = new Buffer(0);
    var accumulatedLen = this.socketBuffer.length;
    var recvedThisTimeLen = Buffer.byteLength(data);
    var currentLength = accumulatedLen + recvedThisTimeLen;
    this.socketBuffer = Buffer.concat([this.socketBuffer, data]);
    if (this.socketBuffer.length >= HEADER_LENGTH){
        if (this.socketBuffer.compare(HEADER_BUFFER,0,HEADER_BUFFER_LENGTH,0,HEADER_BUFFER_LENGTH)){ // got fibonacci header
            var messageLen = this.socketBuffer.readUIntLE(HEADER_BUFFER_LENGTH, 6);
            if (currentLength => messageLen){
                var messageCrc32 = this.socketBuffer.readUIntLE(HEADER_BUFFER_LENGTH + 6, 6);
                var messageBuffer = new Buffer(messageLen);
                this.socketBuffer.copy(messageBuffer, 0, HEADER_LENGTH, HEADER_LENGTH + messageLen);
                var checksum = crc32(messageBuffer);
                if (checksum == messageCrc32){
                    debug('RECV:' + messageBuffer);
                    this.emit('message', messageBuffer);
                }
                this.socketBuffer = this.socketBuffer.slice(HEADER_LENGTH + messageLen, this.socketBuffer.length);
            }
        }
        else // we dont have a valid header, so discard the buffer
            this.socketBuffer = new Buffer(0);
    }
}

var makeCRCTable = function(){
    var c;
    var crcTable = [];
    for(var n =0; n < 256; n++){
        c = n;
        for(var k =0; k < 8; k++){
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    _crcTable = crcTable;
    return _crcTable;
}

var _crcTable = null;
var crc32 = function(buf) {
    var crcTable = _crcTable || makeCRCTable();
    var crc = 0 ^ (-1);
    for (var i = 0; i < buf.length; i++ ) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
};

function wrapConnectedSocket(socket){
    return new WrappedSocket(null,socket);
}

function WrappedServer(options, connectionListener){
    if (!(this instanceof WrappedServer)) return new WrappedServer(options, connectionListener);

     if (typeof options === 'function') {
        connectionListener = options;
        options = {};
    } else if (options == null || typeof options === 'object') {
        options = options || {};

        if (typeof connectionListener === 'function') {
        }
    } else {
        throw new TypeError('options must be an object');
    }

    var tempConnectionListener = null;

    this._netServer = new net.Server(options, null);

    if (typeof connectionListener === 'function'){
        this.on('connection', connectionListener);
    }

}

WrappedServer.prototype.on = function(event,callback){
    if (event === 'connection'){
        this._netServer.on(event,function(connectedSocket){
            callback(wrapConnectedSocket(connectedSocket));
        });
    }
    else
        this._netServer.on(event,callback);
}

WrappedServer.prototype.address = function(){
    return this._netServer.address();
}

WrappedServer.prototype.getConnections = function(cb) {
    return this._netServer.getConnections(cb);
}

WrappedServer.prototype.listen = function(args){
    return this._netServer.listen(args);
}

WrappedServer.prototype.close = function(cb) {
    return this._netServer.close(cb);
}

exports.createServer = function(options, connectionListener) {
  return new WrappedServer(options, connectionListener);
};

exports.net = net;
exports.Socket = WrappedSocket;
exports.Server = WrappedServer;

