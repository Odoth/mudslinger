import { OutputWin } from "../../src/ts/outputWin";
import { OutputManager, ConfigIf } from "../../src/ts/outputManager";
import { Mxp } from "../../src/ts/mxp";
import { ansiColorTuple} from "../../src/ts/color";
import { utf8encode } from "../../src/ts/util";

let fakeMgrConfig = {
    set: (key: "defaultAnsiFg" | "defaultAnsiBg", val: ansiColorTuple): void => {

    },
    get: (key: string): any => {
        return undefined;
    }
}

let fakeWinConfig = {
    onSet: (key: "colorsEnabled", cb: (val: any) => void): void => {},
    getDef: (key: "colorsEnabled", def: any): any => { return def; }
}


function run() {
    let outputWin = new OutputWin(fakeWinConfig);
    let outputManager = new OutputManager(outputWin, fakeMgrConfig);
    let mxp = new Mxp(outputManager);
    outputManager.EvtMxpTag.handle((tag: string) => {
        mxp.handleMxpTag(tag);
    });
    outputManager.EvtNewLine.handle(() => {
        mxp.handleNewline();
    });
    mxp.EvtEmitCmd.handle((data) => {
        console.log('MXP emit cmd:', data);
    });

    let write = (msg: string) => {
        outputManager.handleTelnetData(utf8encode(msg));
    }

    write(
        'MXP stuff\n' +
        "<version>: (should be no output)" +
        "\x1b[1z<version>\x1b[7z\n" +
        "send no href: " +
        "\x1b[1z<send>\x1b[7za command\x1b[1z</send>\x1b[7z\n" +
        "send with href: " +
        "\x1b[1z<send href=\"a different command\">\x1b[7za command\x1b[1z</send>\x1b[7z\n"
    );


    write('\n');
    write('Xterm colors\n');
    for (let i = 0; i < 16; ++i) {
        write('\x1b[38;5;' + i.toString() + 'm' + i.toString() + ' ');
    }
    write('\x1b[0m');
    write('\n');
    for (let i = 0; i < 16; ++i) {
        write('\x1b[48;5;' + i.toString() + 'm' + i.toString() + ' ');
    }
    write('\x1b[0m');
    write('\n');

    for (let i = 16; i < 256; ++i) {
        if ((i - 16) % 6 === 0) {
            write('\n');
        }
        write('\x1b[38;5;' + i.toString() + 'm' + i.toString() + ' ');
    }
    write('\x1b[0m');
    write('\n');
    for (let i = 16; i < 256; ++i) {
        if ((i - 16) % 6 == 0) {
            write('\n');
        }
        write('\x1b[48;5;' + i.toString() + 'm' + i.toString() + ' ');
    }
    write('\x1b[0m');
    write('\n');


}

export namespace MudslingerMxp {
    export function init() {
        console.log("hello mudslinger mxp");
        run();
    }
}

(<any>window).MudslingerMxp = MudslingerMxp;
