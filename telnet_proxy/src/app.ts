import * as http from "http";
import * as socketio from "socket.io";
import * as net from "net";
import * as readline from "readline";
import axios from "axios";
import * as express from "express";

import { IoEvent } from "../../common/src/ts/ioevent";

let serverConfig = require("../../../configServer.js");
console.log(serverConfig);

let telnetIdNext: number = 0;

interface connInfo {
    telnetId: number;
    uuid: string;
    userIp: string;
    host: string;
    port: number;
    startTime: Date;
};

let openConns: {[k: number]: connInfo} = {};

let server: http.Server = http.createServer();
let io: SocketIO.Server = socketio();

let telnetNs: SocketIO.Namespace = io.of("/telnet");
telnetNs.on("connection", (client: SocketIO.Socket) => {
    let telnet: net.Socket;
    let ioEvt = new IoEvent(client);
    let remoteAddr = client.request.headers['x-real-ip'] || client.request.connection.remoteAddress;

    let writeQueue: any[] = [];
    let canWrite: boolean =  true;
    let checkWrite = () => {
        if (!canWrite) { return; }

        if (writeQueue.length > 0) {
            let data = writeQueue.shift();
            canWrite = false;
            canWrite = telnet.write(data as Buffer);
        }
    };

    let writeData = (data: any) => {
        writeQueue.push(data);
        checkWrite();
    };

    client.on("disconnect", () => {
        if (telnet) {
            telnet.destroy();
            telnet = null;
        }
    });

    ioEvt.clReqTelnetOpen.handle((args: [string, number]) => {
        if (telnet) { return; }
        telnet = new net.Socket();

        let telnetId: number = telnetIdNext++;

        let host: string;
        let port: number;

        let conStartTime: Date;

        host = args[0];
        port = args[1];

        openConns[telnetId] = {
            telnetId: telnetId,
            uuid: null,
            userIp: remoteAddr,
            host: host,
            port: port,
            startTime: null
        };

        telnet.on("data", (data: Buffer) => {
            ioEvt.srvTelnetData.fire(data.buffer);
        });
        telnet.on("close", (had_error: boolean) => {
            let conn = openConns[telnetId];
            delete openConns[telnetId];
            ioEvt.srvTelnetClosed.fire(had_error);
            telnet = null;
            let connEndTime = new Date();
            let elapsed: number = conStartTime && (<any>connEndTime - <any>conStartTime);
            tlog(telnetId, "::", remoteAddr, "->", host, port, "::closed after", elapsed && (elapsed/1000), "seconds");

            if (conn) {
                axinst.post('/usage/disconnect', {
                    'uuid': conn.uuid,
                    'sid': client.id,
                    'from_addr': remoteAddr,
                    'to_addr': host,
                    'to_port': port,
                    'time_stamp': connEndTime,
                    'elapsed_ms': elapsed
                }).catch((o) => {
                    console.error("/usage/disconnect error:", o);
                });
            }
        });
        telnet.on("drain", () => {
            canWrite = true;
            checkWrite();
        });
        telnet.on("error", (err: Error) => {
            tlog(telnetId, "::", "TELNET ERROR:", err);
            ioEvt.srvTelnetError.fire(err.message);
        });

        try {
            tlog(telnetId, "::", remoteAddr, "->", host, port, "::opening");
            telnet.connect(port, host, () => {
                ioEvt.srvTelnetOpened.fire([host, port]);
                conStartTime = new Date();
                openConns[telnetId].startTime = conStartTime;

                axinst.post('/usage/connect', {
                    'sid': client.id,
                    'from_addr': remoteAddr,
                    'to_addr': host,
                    'to_port': port,
                    'time_stamp': conStartTime
                }).then((resp) => {
                    let conn = openConns[telnetId];
                    if (conn) {
                        conn.uuid = resp.data.uuid;
                    }
                }).catch((o) => {
                    console.error("/usage/connect error:", o);
                });
            });
        }
        catch (err) {
            delete openConns[telnetId];
            tlog(telnetId, "::", "ERROR CONNECTING TELNET:", err);
            ioEvt.srvTelnetError.fire(err.message);
        }
    });

    ioEvt.clReqTelnetClose.handle(() => {
        if (telnet == null) { return; }
        telnet.destroy();
        telnet = null;
    });

    ioEvt.clReqTelnetWrite.handle((data) => {
        if (telnet == null) { return; }
        writeData(data);
    });

    ioEvt.srvSetClientIp.fire(remoteAddr);
});

io.attach(server);

server.on("error", (err: Error) => {
    tlog("Server error:", err);
});

server.listen(serverConfig.serverPort, serverConfig.serverHost, () => {
    tlog("Server is running on " + serverConfig.serverHost + ":" + serverConfig.serverPort);
});

function tlog(...args: any[]) {
    console.log("[[", new Date().toLocaleString(), "]]", ...args);
}

let axinst = axios.create({
    baseURL: serverConfig.apiBaseUrl,
    auth: {
        username: serverConfig.apiKey,
        password: ':none'
    }
});

// Admin CLI
let adminIdNext: number = 0;

type adminFunc = (sock: net.Socket, args: string[]) => void;

let adminFuncs: {[k: string]: adminFunc} =  {};
adminFuncs["help"] = (sock: net.Socket, args: string[]) => {
    sock.write("Available commands:\n\n");
    for (let cmd in adminFuncs) {
        sock.write(cmd + "\n");
    }
    sock.write("\n");
};

adminFuncs["ls"] = (sock: net.Socket, args: string[]) => {
    sock.write("Open connections:\n\n");
    for (let tnId in openConns) {
        let o = openConns[tnId];
        sock.write( o.telnetId.toString() + 
                    ": " + o.userIp  +
                    " => " + o.host + "," + o.port.toString() +
                    "\n");
    }
};

let adminServer = net.createServer((socket: net.Socket) => {
    let adminId: number = adminIdNext++;

    tlog("{{", adminId, "}}", "{{admin connection opened}}");

    let rl = readline.createInterface({
        input: socket
    });

    rl.on("line", (line: string) => {
        let words = line.split(" ");

        if (words.length > 0) {
            let funcName = words[0];
            if (funcName === "exit") {
                socket.end();
                return;
            }

            let afunc = adminFuncs[words[0]];

            if (!afunc) {
                socket.write("No such command. Try 'help'.\n");
            } else {
                try {
                    afunc(socket, words.slice(1));
                }
                catch (err) {
                    tlog("{{", adminId, "}}", "{{admin error '" + line + "':", err, "}}");
                    socket.write("COMMAND ERROR\n");
                }
            }
        }

        socket.write("admin> ");
    });

    socket.on("close", () => {
        tlog("{{", adminId, "}}", "{{admin closed}}");
    });

    socket.on("error", (err: Error) => {
        tlog("{{", adminId, "}}", "{{admin error: " + err);
    });

    socket.write("admin> ");
});

if (serverConfig.adminHost !== "localhost") {
    throw "Auth for Admin CLI is not implemented. Must use localhost.";
}

adminServer.listen(serverConfig.adminPort, serverConfig.adminHost, () => {
    tlog("Admin CLI server is running on " + serverConfig.adminHost + ":" + serverConfig.adminPort);
});

// Admin Web API
let adminApp = express();

adminApp.get('/conns', (req, res) => {
    let conns = [];
    for (let id in openConns) {
        let c = openConns[id];
        conns.push({
            ...c,
            startUTC: c.startTime.getTime()
        })
    }
    res.send(conns);
});

if (serverConfig.adminWebHost !== "localhost") {
    throw "Auth for Admin Web API is not implemented. Must use localhost.";
}

adminApp.listen(serverConfig.adminWebPort, serverConfig.adminWebHost, () => {
    tlog("Admin API server is running on " + serverConfig.adminWebHost + ":" + serverConfig.adminWebPort);
});
