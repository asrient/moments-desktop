const { Buffer } = require('buffer');
const net = require('net');
const Emitter = require("component-emitter");
const message = require('./msg.js');
const crypto = require('crypto');
const frame = require('./frame.js');

const frameSize = 64535;//65535;

var api = {
    ongoing: {},
    roaming: null,
    isInit: false,
    willDisconnect: false,
    isUpgraded: false,
    retries: 0,
    host: "airbroker.herokuapp.com",
    port: 80,
    socket: null,
    uid: null,
    sessionId: null,
    reconnect: function () {
        if (this.isInit && !this.willDisconnect) {
            this.isUpgraded = false;
            this.sessionId = null;
            this.socket = null;
            this.ongoing = {};
            this.retries++;
            if (this.retries < 4) {
                console.log("reconnecting...");
                this.connect();
            }
            else {
                console.error("No internet connection");
                api.emit('disconnection');
                this.retries = 0;
                setTimeout(() => {
                    this.reconnect();
                }, 40000)
            }
        }
    },
    write: function (stuffs) {
        if (stuffs != null && this.socket != null) {
            this.socket.cork();
            this.socket.write(stuffs);
            this.socket.uncork();
        }
    },
    cork: function () {
        if (this.socket != null) {
            this.socket.cork();
        }
    },
    uncork: function () {
        if (this.socket != null) {
            this.socket.uncork();
        }
    },
    connect: function () {
        this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
            // 'connect' listener.
            console.log('connected to server! Upgrading..');
            this.write("GET / HTTP/1.1\r\n" +
                "Host: " + this.host + "\r\n" +
                "Upgrade-Insecure-Requests: 1\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "\r\n");
        });
        this.socket.setNoDelay(true);
        //this.socket.uncork();
        this.socket.on("data", (msg) => {
            if (!this.isUpgraded) {
                var str = Buffer.from(msg).toString();
                var title = str.split("\r\n")[0];
                if (title == "HTTP/1.1 101 Switching Protocols") {
                    console.log("upgraded! now connecting...");
                    this.write(frame.build(true, crypto.randomBytes(8), message.build({ type: 'connect', uid: this.uid })));
                    this.isUpgraded = true;
                }
                else {
                    console.error("not upgraded yet!", title);
                }
            }
            else {
                //already upgraded
                var feed = msg;
                if (this.roaming != null) {
                    feed = Buffer.concat([this.roaming, msg]);
                }
                const parsedFrame = frame.parse(feed);
                this.roaming = parsedFrame.roaming;
                parsedFrame.chunks.forEach((chunk) => {
                    var key = chunk.key;
                    var fin = chunk.fin;
                    var data = chunk.data;
                    if (this.sessionId == null) {
                        //not connected yet!
                        var m = message.parse(data);
                        if (m.type == 'connected') {
                            var airId = m.airid;
                            this.sessionId = airId.split(':')[2];
                            this.retries = 0;
                            this.ongoing = {};
                            console.log("connected!", airId);
                            api.emit('connection', airId);
                        }
                    }
                    else {
                        if (this.ongoing[key] != undefined) {
                            var stream = this.ongoing[key].data;
                            this.ongoing[key].data = Buffer.concat([stream, data]);
                            if (fin) {
                                var m = message.parse(this.ongoing[key].data);
                                if (m.type != undefined) {
                                    if (m.type == 'request') {
                                        api.emit('request', { key, message: m });
                                    }
                                    else if (m.type == 'response') {
                                        api.emit('response', { key, message: m });
                                    }
                                }
                                delete this.ongoing[key];
                            }
                            else {
                                //now is a good time to emit events for partial data receiving
                            }
                        }
                        else {
                            if (fin) {
                                var m = message.parse(data);
                                if (m.type != undefined) {

                                    if (m.type == 'request') {
                                        api.emit('request', { key, message: m });
                                    }
                                    else if (m.type == 'response') {
                                        api.emit('response', { key, message: m });
                                    }
                                }
                            }
                            else {
                                //more chunks r supposed to arrive, for reference store this chunk in ongoing
                                this.ongoing[key] = { data };
                            }
                        }
                    }
                })
            }
        })
        this.socket.on("error", (msg) => {
            console.error(msg);
            //this.reconnect();
        })
        this.socket.on("close", (msg) => {
            console.log("socket closed!");
            this.reconnect();
        })
        this.socket.on("end", (msg) => {
            console.log("socket ended!");
        })
    },
    start: function (uid, host, port = 80) {
        this.uid = uid;
        this.host = host,
            this.port = port;
        if (!this.isInit) {
            this.connect();
        }
        this.isInit = true;
    },
    getAirId: function () {
        if (this.uid != null && this.host != null && this.sessionId != null)
            return this.uid + ':' + this.host + ':' + this.sessionId;
        else return null;
    },
    stop: function () {
        this.isUpgraded = false;
        this.sessionId = null;
        this.socket = null;
        this.willDisconnect = true;
        this.ongoing = {};
    },
    sendFrame: function (key, msg) {
        var offset = 0;
        var last = msg.length - 1;
        var end = 0;
        var chunk;
        var fin = false;

        const send = () => {
            if (offset < last) {
                //console.log("---sending a chunk---");
                end = offset + frameSize - 50;//
                if (end > last) {
                    end = last;
                }
                chunk = msg.slice(offset, end);
                fin = false;
                if (end == last) {
                    fin = true;
                }
                var frm = frame.build(fin, key, chunk);
                //console.log('FIN', fin);
                //console.log('KEY', key.toString());
                this.write(frm);
                offset = end;
                //console.log('--------------------')
            }
            else
                console.error('local: offset > last', offset, last);
        }

        const schedule = () => {
            if (!fin) {
                console.log('SCHEDULING..');
                send();
                schedule();
            }
        }

        if (msg.length > frameSize) {
            //size too large to be sent together, break them up!
            console.log('size too large to be sent together, break them up!');
            send();
            if (!fin) {
                schedule();
            }
        }
        else {
            //msg can be sent at once
            this.write(frame.build(true, key, msg));
        }
    },
    request: function (to, keyStr, body = null) {
        //console.log('-----building new request-------');
        var key = Buffer.from(keyStr);
        var msg = message.build({ type: 'request', to, body });
        this.sendFrame(key, msg);
    },
    reply: function (to, keyStr, status = 200, body = null) {
        //console.log('-----building new response-------');
        var key = Buffer.from(keyStr);
        var msg = message.build({ type: 'response', to, status, body });
        this.sendFrame(key, msg)
    }
}

Emitter(api);

module.exports = api;