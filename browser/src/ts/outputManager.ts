import {OutputWin} from "./outputWin";
import {OutWinBase} from "./outWinBase";
import {EventHook} from "./event";
import { utf8decode } from "./util";

import { ansiColorTuple, copyAnsiColorTuple, colorIdToHtml,
         ansiFgLookup, ansiBgLookup, ansiName, ansiLevel } from "./color";


export interface ConfigIf {
    set(key: "defaultAnsiFg" | "defaultAnsiBg", val: ansiColorTuple): void;
    set(key: "fontSize", val: string): void;
    get(key: "defaultAnsiFg" | "defaultAnsiBg"): ansiColorTuple;
    get(key: "utf8Enabled"): boolean;
    get(key: "fontSize"): string;
}

export class OutputManager {
    public EvtMxpTag = new EventHook<string>();
    public EvtNewLine = new EventHook<void>();

    private target: OutWinBase;
    private targetWindows: Array<OutWinBase>;

    private ansiReverse = false;
    private ansiBold = false;

    private ansiFg: ansiColorTuple;
    private ansiBg: ansiColorTuple;

    private fgColorId: string;
    private bgColorId: string;

    private defaultAnsiFg: ansiColorTuple;
    private defaultFgId: string;
    private defaultAnsiBg: ansiColorTuple;
    private defaultBgId: string;

    constructor(private outputWin: OutputWin, private config: ConfigIf) {
        this.targetWindows = [this.outputWin];
        this.target = this.outputWin;

        this.loadConfig();
    }

    private loadConfig() {
        let defaultAnsiFg = this.config.get("defaultAnsiFg");
        if (defaultAnsiFg) {
            this.setDefaultAnsiFg(defaultAnsiFg[0], defaultAnsiFg[1]);
        } else {
            this.setDefaultAnsiFg("green", "low");
        }
        let defaultAnsiBg = this.config.get("defaultAnsiBg");
        if (defaultAnsiBg) {
            this.setDefaultAnsiBg(defaultAnsiBg[0], defaultAnsiBg[1]);
        } else {
            this.setDefaultAnsiBg("black", "low");
        }

        let fontSize = this.config.get("fontSize");
        if (fontSize) {
            $(".outputText").css("font-size", fontSize);
        }
    }

    private outputDone () {
        this.target.outputDone();
    }

    // Redirect output to another OutWinBase until it"s popped
    public pushTarget(tgt: OutWinBase) {
        this.targetWindows.push(tgt);
        this.target = tgt;
    }

    public popTarget() {
        this.target.outputDone();
        this.targetWindows.pop();
        this.target = this.targetWindows[this.targetWindows.length - 1];
    }

    // propagate MXP elements to target
    public pushMxpElem(elem: JQuery) {
        this.target.pushElem(elem);
    }

    public popMxpElem() {
        return this.target.popElem();
    }

    private handleText(data: string) {
        this.target.addText(data);
    }

    private setFgColorId(colorId: string) {
        this.fgColorId = colorId;
        this.pushFgColorIdToTarget();
    }

    private pushFgColorIdToTarget() {
        if (this.ansiReverse) {
            this.target.setBgColorId(this.fgColorId || this.defaultFgId);
        } else {
            this.target.setFgColorId(this.fgColorId);
        }
    }

    private setAnsiFg(color: ansiColorTuple) {
        this.ansiFg = color;
        if (color) {
            this.setFgColorId(color[0] + "-" + color[1]);
        } else {
            this.setFgColorId(null);
        }
    }

    private setBgColorId(color: string) {
        this.bgColorId = color;
        this.pushBgColorIdToTarget();
    }

    private pushBgColorIdToTarget() {
        if (!this.ansiReverse) {
            this.target.setBgColorId(this.bgColorId);
        } else {
            this.target.setFgColorId(this.bgColorId || this.defaultBgId);
        }
    }

    private setAnsiBg(color: ansiColorTuple) {
        this.ansiBg = color;
        if (color) {
            this.setBgColorId(color[0] + "-" + color[1]);
        } else {
            this.setBgColorId(null);
        }
    }

    private handleXtermEscape(color_code: number, is_bg: boolean ) {
        if (is_bg) {
            this.ansiBg = null;
            this.setBgColorId(color_code.toString());
        } else {
            this.ansiFg = null;
            this.setFgColorId(color_code.toString());
        }
    }

    /* handles graphics mode codes http://ascii-table.com/ansi-escape-sequences.php*/
    private handleAnsiGraphicCodes(codes: Array<string>) {
        /* Special case XTERM 256 color format */
        if (codes.length === 3)
        {
            if (codes[0] === "38" && codes[1] === "5") {
                this.handleXtermEscape(parseInt(codes[2]), false);
                return;
            } else if (codes[0] === "48" && codes[1] === "5") {
                this.handleXtermEscape(parseInt(codes[2]), true);
                return;
            }
        }

        /* Standard ANSI color sequence */
        let new_fg: ansiColorTuple;
        let new_bg: ansiColorTuple;

        for (let i = 0; i < codes.length; i++) {

            let code = parseInt(codes[i]);

            /* all off */
            if (code === 0) {
                new_fg = null;
                new_bg = null;
                this.ansiReverse = false;
                this.ansiBold = false;
                continue;
            }

            /* bold on */
            if (code === 1) {
                this.ansiBold = true;

                // On the chance that we have xterm colors, just ignore bold
                if (new_fg || this.ansiFg || !this.fgColorId) {
                    new_fg = new_fg || this.ansiFg || copyAnsiColorTuple(this.defaultAnsiFg);
                    new_fg[1] = "high";
                }
                continue;
            }

            /* reverse */
            if (code === 7) {
                /* TODO: handle xterm reversing */
                this.ansiReverse = !this.ansiReverse;
                this.pushFgColorIdToTarget();
                this.pushBgColorIdToTarget();
                continue;
            }

            /* foreground colors */
            if (code >= 30 && code <= 37) {
                let color_name = ansiFgLookup[code];
                new_fg = new_fg || copyAnsiColorTuple(this.defaultAnsiFg);
                new_fg[0] = color_name;
                if (this.ansiBold) {
                    new_fg[1] = "high";
                }
                continue;
            }

            /* background colors */
            if (code >= 40 && code <= 47) {
                let color_name = ansiBgLookup[code];
                new_bg = new_bg || copyAnsiColorTuple(this.defaultAnsiBg);
                new_bg[0] = color_name;
                continue;
            }

            /* Default foreground color */
            if (code === 39) {
                new_fg = null;
                continue;
            }

            /* Normal color or intensity */
            if (code === 22) {
                this.ansiBold = false;
                if (!new_fg) {
                    if (this.ansiFg) {
                        new_fg = copyAnsiColorTuple(this.ansiFg);
                    } else {
                        new_fg = copyAnsiColorTuple(this.defaultAnsiFg);
                    }
                }
                new_fg[1] = "low";
                continue;
            }

            console.log("Unsupported ANSI code:", code);
        }

        if (new_fg !== undefined) {
            this.setAnsiFg(new_fg);
        }
        if (new_bg !== undefined) {
            this.setAnsiBg(new_bg);
        }
    }

    private setDefaultAnsiFg(colorName: ansiName, level: ansiLevel) {
        // if ( !(colorName in ansiColors) ) {
        //     console.log("Invalid colorName: " + colorName);
        //     return;
        // }

        if ( (["low", "high"]).indexOf(level) === -1) {
            console.log("Invalid level: " + level);
            return;
        }

        this.defaultAnsiFg = [colorName, level];
        this.defaultFgId = colorName + "-" + level;
        $(".outputText").css("color", colorIdToHtml[this.defaultFgId]);
    }

    private setDefaultAnsiBg(colorName: ansiName, level: ansiLevel) {
        // if ( !(colorName in ansiColors) ) {
        //     console.log("Invalid colorName: " + colorName);
        //     return;
        // }

        if ( (["low", "high"]).indexOf(level) === -1) {
            console.log("Invalid level: " + level);
            return;
        }

        this.defaultAnsiBg = [colorName, level];
        this.defaultBgId = colorName + "-" + level;
        $(".outputText").css("background-color", colorIdToHtml[this.defaultBgId]);
    }

    handleChangeDefaultColor(name: string, level: string) {
        this.setDefaultAnsiFg(<ansiName>name, <ansiLevel>level);
        this.saveColorCfg();
    }

    handleChangeDefaultBgColor(name: string, level: string) {
        this.setDefaultAnsiBg(<ansiName>name, <ansiLevel>level);
        this.saveColorCfg();
    }

    handleChangeFontSize(sz: string) {
        $(".outputText").css("font-size", sz);
        this.config.set("fontSize", sz);
    }

    private saveColorCfg() {
        this.config.set("defaultAnsiFg", this.defaultAnsiFg);
        this.config.set("defaultAnsiBg", this.defaultAnsiBg);
    }

    private partialUtf8: Uint8Array;
    private partialSeq: string;
    public handleTelnetData(data: ArrayBuffer) {
        // console.timeEnd("command_resp");
        // console.time("_handle_telnet_data");

        let rx = this.partialSeq || "";
        this.partialSeq = null;

        if (this.config.get("utf8Enabled") === true) {
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

                this.handleText(output);
                output = "";

                this.EvtNewLine.fire();

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
                this.handleText(output);
                output = "";

                i += match[0].length;
                this.handleAnsiGraphicCodes(["0"]);
                continue;
            }

            /* ansi escapes (including 256 color) */
            re = /^\x1b\[([0-9]+(?:;[0-9]+)*)m/;
            match = re.exec(substr);
            if (match) {
                this.handleText(output);
                output = "";

                i += match[0].length;
                let codes = match[1].split(";");
                this.handleAnsiGraphicCodes(codes);
                continue;
            }

            /* MXP escapes */
            re = /^\x1b\[1z(<.*?>)\x1b\[7z/;
            match = re.exec(substr);
            if (match) {
                // MXP tag. no discerning what it is or if it"s opening/closing tag here
                i += match[0].length;
                this.handleText(output);
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
                this.handleText(output);
            }
            this.partialSeq = rx.slice(i);
            console.log("Got partial:");
            console.log(this.partialSeq);
            break;
        }
        if (!this.partialSeq) {
            /* if partial we already outputed, if not let"s hit it */
            this.handleText(output);
        }
        this.outputDone();
        // console.timeEnd("_handle_telnet_data");
    }
}
