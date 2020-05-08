import { EventHook } from "./event";

import * as io from "socket.io-client";
import { Mxp } from "./mxp";
import { OutputManager } from "./outputManager";
import { IoEvent } from "../shared/ioevent";
import { TelnetClient } from "./telnetClient";
import { utf8decode, utf8encode } from "./util";
import { UserConfig } from "./userConfig";


declare let configClient: any;


export class Socket {
    public EvtServerEcho = new EventHook<boolean>();
    public EvtTelnetConnect = new EventHook<[string, number]>();
    public EvtTelnetDisconnect = new EventHook<void>();
    public EvtTelnetError = new EventHook<string>();
    public EvtMxpTag = new EventHook<string>();
    public EvtWsError = new EventHook<any>();
    public EvtWsConnect = new EventHook<{sid: string}>();
    public EvtWsDisconnect = new EventHook<void>();
    public EvtSetClientIp = new EventHook<string>();

    private ioConn: SocketIOClient.Socket;
    private ioEvt: IoEvent;
    private telnetClient: TelnetClient;
    private clientIp: string;

    constructor(private outputManager: OutputManager, private mxp: Mxp) {
    }

    public open() {
        this.ioConn = io.connect(
            location.protocol + "//" +
            (configClient.socketIoHost || document.domain) +
            ":" +
            (configClient.socketIoPort || location.port) +
            "/telnet");

        this.ioConn.on("connect", () => {
            this.EvtWsConnect.fire({sid: this.ioConn.id});
        });

        this.ioConn.on("disconnect", () => {
            this.EvtWsDisconnect.fire(null);
        });

        this.ioConn.on("error", (msg: any) => {
            this.EvtWsError.fire(msg);
        });

        this.ioEvt = new IoEvent(this.ioConn);

        this.ioEvt.srvTelnetOpened.handle((val: [string, number]) => {
            this.telnetClient = new TelnetClient((data) => {
                this.ioEvt.clReqTelnetWrite.fire(data);
            });
            this.telnetClient.clientIp = this.clientIp;

            this.telnetClient.EvtData.handle((data) => {
                this.handleTelnetData(data);
            });

            this.telnetClient.EvtServerEcho.handle((data) => {
                this.EvtServerEcho.fire(data);
            });

            this.EvtTelnetConnect.fire(val);
        });

        this.ioEvt.srvTelnetClosed.handle(() => {
            this.telnetClient = null;
            this.EvtTelnetDisconnect.fire(null);
        });

        this.ioEvt.srvTelnetError.handle((data) => {
            this.EvtTelnetError.fire(data);
        });

        this.ioEvt.srvTelnetData.handle((data) => {
            if (this.telnetClient) {
                this.telnetClient.handleData(data);
            }
        });

        this.ioEvt.srvSetClientIp.handle((ipAddr: string) => {
            let re = /::ffff:(\d+\.\d+\.\d+\.\d+)/;
            let match = re.exec(ipAddr);
            if (match) {
                ipAddr = match[1];
            }

            this.clientIp = ipAddr;
            if (this.telnetClient) {
                this.telnetClient.clientIp = ipAddr;
            }
            this.EvtSetClientIp.fire(this.clientIp);
        });
    }

    public openTelnet(host: string, port: number) {
        this.ioEvt.clReqTelnetOpen.fire([host, port]);
    }

    public closeTelnet() {
        this.ioEvt.clReqTelnetClose.fire(null);
    }

    sendCmd(cmd: string) {
        cmd += "\r\n";
        let arr: Uint8Array;
        if (UserConfig.get("utf8Enabled") === true) {
            arr = utf8encode(cmd);
        } else {
            arr = new Uint8Array(cmd.length);
            for (let i = 0; i < cmd.length; i++) {
                arr[i] = cmd.charCodeAt(i);
            }
        }

        this.ioEvt.clReqTelnetWrite.fire(arr.buffer);
    }

    private partialUtf8: Uint8Array;
    private partialSeq: string;
    private handleTelnetData(data: ArrayBuffer) {
        // console.timeEnd("command_resp");
        // console.time("_handle_telnet_data");

        let rx = this.partialSeq || "";
        this.partialSeq = null;

        if (UserConfig.get("utf8Enabled") === true) {
            let utf8Data: Uint8Array;
            if (this.partialUtf8) {
                utf8Data = new Uint8Array(data.byteLength + this.partialUtf8.length);
                utf8Data.set(this.partialUtf8, 0);
                utf8Data.set(new Uint8Array(data), this.partialUtf8.length);
                this.partialUtf8 = null;
            } else {
                utf8Data = new Uint8Array(data);
            }

            let result = utf8decode(utf8Data);
            this.partialUtf8 = result.partial;
            rx += result.result;
        } else {
            rx += String.fromCharCode.apply(String, new Uint8Array(data));
        }

        let output = "";
        let rx_len = rx.length;
        let max_i = rx.length - 1;

        for (let i = 0; i < rx_len; ) {
            let char = rx[i];

            /* strip carriage returns while we"re at it */
            if (char === "\r") {
                i++; continue;
            }

            /* Always snip at a newline so other modules can more easily handle logic based on line boundaries */
            if (char === "\n") {
                output += char;
                i++;

                this.outputManager.handleText(output);
                output = "";

                // MXP needs to force close any open tags on newline
                this.mxp.handleNewline();

                continue;
            }

            if (char !== "\x1b") {
                output += char;
                i++;
                continue;
            }

            /* so we have an escape sequence ... */
            /* we only expect these to be color codes or MXP tags */
            let substr = rx.slice(i);
            let re;
            let match;

            /* ansi default, equivalent to [0m */
            re = /^\x1b\[m/;
            match = re.exec(substr);
            if (match) {
                this.outputManager.handleText(output);
                output = "";

                i += match[0].length;
                this.outputManager.handleAnsiGraphicCodes(["0"]);
                continue;
            }

            /* ansi escapes (including 256 color) */
            re = /^\x1b\[([0-9]+(?:;[0-9]+)*)m/;
            match = re.exec(substr);
            if (match) {
                this.outputManager.handleText(output);
                output = "";

                i += match[0].length;
                let codes = match[1].split(";");
                this.outputManager.handleAnsiGraphicCodes(codes);
                continue;
            }

            /* MXP escapes */
            re = /^\x1b\[1z(<.*?>)\x1b\[7z/;
            match = re.exec(substr);
            if (match) {
                // MXP tag. no discerning what it is or if it"s opening/closing tag here
                i += match[0].length;
                this.outputManager.handleText(output);
                output = "";
                this.EvtMxpTag.fire(match[1]);
                continue;
            }

            re = /^\x1b\[7z/;
            match = re.exec(substr);
            if (match) {
                /* this gets sent once at the beginning to set the line mode. We don"t need to do anything with it */
                i += match[0].length;
                continue;
            }

            /* other CSI sequences recognized but not supported */
            re = /^\x1b\[[0-9]*[ABCDEFGHJKSTfn]/;
            match = re.exec(substr);
            if (match) {
                console.log("Unsupported CSI sequence:", match[0]);
                i += match[0].length;
                continue;
            }

            /* need to account for malformed or unsupported tags or sequences somehow... so treat start of another sequence and new lines as boundaries */
            let esc_ind = substr.slice(1).indexOf("\x1b");
            let nl_ind = substr.indexOf("\n");
            let bound_ind = null;

            /* Use whichever boundary appears first */
            if (esc_ind !== -1) {
                bound_ind = esc_ind;
            }
            if (nl_ind !== -1) {
                bound_ind = (bound_ind === null) ? (nl_ind - 1) : Math.min(bound_ind, nl_ind - 1);
            }

            if (bound_ind !== null) {
                let bad_stuff = substr.slice(0, bound_ind + 1);
                i += bad_stuff.length;
                console.log("Malformed sequence or tag");
                console.log(bad_stuff);
                // this.outputManager.handleText("{" + bad_stuff + "}");
                continue;
            }

            /* If we get here, must be a partial sequence
                Send away everything up to the sequence start and assume it will get completed next time
                we receive data...
             */
            if (i !== 0) {
                this.outputManager.handleText(output);
            }
            this.partialSeq = rx.slice(i);
            console.log("Got partial:");
            console.log(this.partialSeq);
            break;
        }
        if (!this.partialSeq) {
            /* if partial we already outputed, if not let"s hit it */
            this.outputManager.handleText(output);
        }
        this.outputManager.outputDone();
        // console.timeEnd("_handle_telnet_data");
    }
}
