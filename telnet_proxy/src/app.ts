import * as http from "http";
import * as socketio from "socket.io";
import * as net from "net";
import * as readline from "readline";
import axios, { AxiosInstance } from "axios";
import * as express from "express";
import * as fs from "fs";
import path = require("path");
import * as yargs from "yargs";
import { IoEvent } from "../../common/src/ts/ioevent";

const argv = yargs
    .option('config', {
        alias: 'c',
        description: 'Use a configuration file',
        type: 'string',
        requiresArg: true,
        config: true
    })
    .option('serverHost', {
        alias: 'h',
        description: 'Pass in a server Host',
        type: 'string',
        requiresArg: true
    })
    .option('serverPort', {
        alias: 'p',
        description: 'Pass in a server Port',
        type: 'number',
        requiresArg: true
    })
    .option('adminHost', {
        alias: 'ah',
        description: 'Pass in an admin Host',
        type: 'string',
        requiresArg: true
    })
    .option('adminPort', {
        alias: 'ap',
        description: 'Pass in a an admin Port',
        type: 'number',
        requiresArg: true
    })
    .option('adminWebHost', {
        alias: 'awh',
        description: 'Pass in an admin Web Host',
        type: 'string',
        requiresArg: true
    })
    .option('adminWebPort', {
        alias: 'awp',
        description: 'Pass in a an admin Web Port',
        type: 'number',
        requiresArg: true
    })
    .option('apiBaseUrl', {
        alias: 'api',
        description: 'Pass in an API base url',
        type: 'string',
        requiresArg: true,
    })
    .option('apiKey', {
        alias: 'apikey',
        description: 'Pass in an API key',
        type: 'string',
        requiresArg: true
    })
    .option('verbosity', {
        alias: 'v',
        description: 'Verbose level (0=WARN, 1=INFO, 2=DEBUG)',
        type: 'number',
        requiresArg: true,
        choices: [0, 1, 2]
    })
    .help()
    .alias('help', 'h')
    .default('verbosity', 1)
    .epilog('Copyright Mudslinger 2020')
    .strict()
    .argv;

// got some bogus extra unhypenated parameters, we support only one unnamed (which is the config file) and must be the first
if (argv._.length>1) {
    yargs.help();
    process.exit(1);
}

let VERBOSE_LEVEL = argv.verbosity;

function WARN(...args: any[])  { VERBOSE_LEVEL >= 0 && tlog.apply(console, args); }
function INFO(...args: any[])  { VERBOSE_LEVEL >= 1 && tlog.apply(console, args); }
function DEBUG(...args: any[]) { VERBOSE_LEVEL >= 2 && tlog.apply(console, args); }

const localConfig = argv.config || argv._[0];

let serverConfigImported = require("../../../configServer.js");
let serverConfig : typeof serverConfigImported;

if (localConfig) try {
    const configPath = path.join( __dirname, localConfig);
    DEBUG("Loading local configuration from: " + configPath);
    if (fs.existsSync(configPath)) {
        serverConfig = JSON.parse(fs.readFileSync(configPath).toString());
        INFO("Local config was loaded.");
    } else {
        serverConfig = serverConfigImported;
        INFO("Local config does not exist, using built defaults.");
    }
} catch(err) {
    serverConfig = serverConfigImported;
    WARN("Local config could not be loaded, using built defaults.");
} else {
    serverConfig = serverConfigImported;
    INFO("Local config file not specified. Using built defaults.");
}

// override settings from command line arguments
serverConfig.serverHost = argv.serverHost || serverConfig.serverHost;
serverConfig.serverPort = argv.serverPort || serverConfig.serverPort;
serverConfig.adminHost = argv.adminHost || serverConfig.adminHost;
serverConfig.adminPort = argv.adminPort || serverConfig.adminPort;
serverConfig.adminWebHost = argv.adminWebHost || serverConfig.adminWebHost;
serverConfig.adminWebPort = argv.adminWebPort || serverConfig.adminWebPort;
serverConfig.apiBaseUrl = argv.apiBaseUrl || serverConfig.apiBaseUrl;
serverConfig.apiKey = argv.apiKey || serverConfig.apiKey;

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
let io: SocketIO.Server = socketio(server, {
     // socket.io erroneusly uses fs.readyFileSync on require.resolve in runtime therefore
     // when webpacked serving client would fail, and we cannot serve it in this case
     // no problems for running in normal mode without webpacking the whole bundle
    serveClient: (typeof require.resolve("socket.io-client") === "string")
  });

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
            INFO(telnetId, "::", remoteAddr, "->", host, port, "::closed after", elapsed && (elapsed/1000), "seconds");

            if (conn) {
                if (axinst) axinst.post('/usage/disconnect', {
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
            WARN(telnetId, "::", "TELNET ERROR:", err);
            ioEvt.srvTelnetError.fire(err.message);
        });

        try {
            INFO(telnetId, "::", remoteAddr, "->", host, port, "::opening");
            telnet.connect(port, host, () => {
                ioEvt.srvTelnetOpened.fire([host, port]);
                conStartTime = new Date();
                openConns[telnetId].startTime = conStartTime;

                if (axinst) axinst.post('/usage/connect', {
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
            WARN(telnetId, "::", "ERROR CONNECTING TELNET:", err);
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

server.on("error", (err: Error) => {
    WARN("Server error:", err);
});

server.listen(serverConfig.serverPort, serverConfig.serverHost, () => {
    INFO("Server is running on " + serverConfig.serverHost + ":" + serverConfig.serverPort);
});

function tlog(...args: any[]) {
    console.log("[[", new Date().toLocaleString(), "]]", ...args);
}

let axinst : AxiosInstance;

if (serverConfig.apiBaseUrl) {
    axinst = axios.create({
        baseURL: serverConfig.apiBaseUrl,
        auth: {
            username: serverConfig.apiKey,
            password: ':none'
        }
    });
    console.log("Using API at: " + serverConfig.apiBaseUrl);
} else {
    console.log("NOT Using API");
}

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

    WARN("{{", adminId, "}}", "{{admin connection opened}}");

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
                    WARN("{{", adminId, "}}", "{{admin error '" + line + "':", err, "}}");
                    socket.write("COMMAND ERROR\n");
                }
            }
        }

        socket.write("admin> ");
    });

    socket.on("close", () => {
        INFO("{{", adminId, "}}", "{{admin closed}}");
    });

    socket.on("error", (err: Error) => {
        WARN("{{", adminId, "}}", "{{admin error: " + err);
    });

    socket.write("admin> ");
});

if (serverConfig.adminHost !== "localhost") {
    throw "Auth for Admin CLI is not implemented. Must use localhost.";
}

adminServer.listen(serverConfig.adminPort, serverConfig.adminHost, () => {
    INFO("Admin CLI server is running on " + serverConfig.adminHost + ":" + serverConfig.adminPort);
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
    INFO("Admin API server is running on " + serverConfig.adminWebHost + ":" + serverConfig.adminWebPort);
});
