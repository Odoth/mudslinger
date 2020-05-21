import { EventHook } from "./event";

import { UserConfig } from "./userConfig";

import { getUrlParameter } from "./util";

import { Socket } from "./socket";
import { AliasEditor } from "./aliasEditor";
import { TriggerEditor } from "./triggerEditor";
import { JsScriptWin } from "./jsScriptWin";
import { AboutWin } from "./aboutWin";
import { ConnectWin } from "./connectWin";

declare let configClient: any;

export class MenuBar {
    public EvtChangeDefaultColor = new EventHook<[string, string]>();
    public EvtChangeDefaultBgColor = new EventHook<[string, string]>();
    public EvtContactClicked = new EventHook<void>();

    private $menuBar: JQuery;
    private $chkEnableColor: JQuery;
    private $chkEnableMxp: JQuery;
    private $chkEnableUtf8: JQuery;
    private $chkEnableTrig: JQuery;
    private $chkEnableAlias: JQuery;

    constructor(
        private socket: Socket,
        private aliasEditor: AliasEditor,
        private triggerEditor: TriggerEditor,
        private jsScriptWin: JsScriptWin,
        private aboutWin: AboutWin,
        private connectWin: ConnectWin
        ) {

        this.makeClickFuncs();

        this.$menuBar = $("#menuBar");

        this.$chkEnableColor = $("#menuBar-chkEnableColor");
        this.$chkEnableUtf8 = $("#menuBar-chkEnableUtf8");
        this.$chkEnableMxp = $("#menuBar-chkEnableMxp");

        this.$chkEnableTrig = $("#menuBar-chkEnableTrig");
        this.$chkEnableAlias = $("#menuBar-chkEnableAlias");

        (<any>this.$menuBar).jqxMenu({ width: "100%", height: "4%"});
        this.$menuBar.on("itemclick", (event: any) => { this.handleClick(event); });

        this.$chkEnableColor.change(function() {
            UserConfig.set("colorsEnabled", this.checked);
        });
        (this.$chkEnableColor[0] as HTMLInputElement).checked = UserConfig.getDef("colorsEnabled", true);

        this.$chkEnableUtf8.change(function() {
            UserConfig.set("utf8Enabled", this.checked);
        });
        (this.$chkEnableUtf8[0] as HTMLInputElement).checked = UserConfig.getDef("utf8Enabled", false);

        this.$chkEnableMxp.change(function() {
            UserConfig.set("mxpEnabled", this.checked);
        });
        (this.$chkEnableMxp[0] as HTMLInputElement).checked = UserConfig.getDef("mxpEnabled", true);

        this.$chkEnableTrig.change(function() {
            UserConfig.set("triggersEnabled", this.checked);
        });
        (this.$chkEnableTrig[0] as HTMLInputElement).checked = UserConfig.getDef("triggersEnabled", true);

        this.$chkEnableAlias.change(function() {
            UserConfig.set("aliasesEnabled", this.checked);
        });
        (this.$chkEnableAlias[0] as HTMLInputElement).checked = UserConfig.getDef("aliasesEnabled", true);
    }

    private clickFuncs: {[k: string]: () => void} = {};
    private makeClickFuncs() {
        this.clickFuncs["Connect"] = () => {
            let hostParam = getUrlParameter("host");
            let portParam = getUrlParameter("port");

            if (hostParam !== undefined && portParam !== undefined) {
                let host = hostParam.trim();
                let port = Number(portParam.trim());

                this.socket.openTelnet(host, port);
            } else {
                this.connectWin.show();
            }
        };

        this.clickFuncs["Disconnect"] = () => {
            this.socket.closeTelnet();
        };

        this.clickFuncs["Aliases"] = () => {
            this.aliasEditor.show();
        };

        this.clickFuncs["Triggers"] = () => {
            this.triggerEditor.show();
        };

        this.clickFuncs["Green on Black"] = () => {
            this.EvtChangeDefaultColor.fire(["green", "low"]);
            this.EvtChangeDefaultBgColor.fire(["black", "low"]);
        };

        this.clickFuncs["White on Black"] = () => {
            this.EvtChangeDefaultColor.fire(["white", "low"]);
            this.EvtChangeDefaultBgColor.fire(["black", "low"]);
        };

        this.clickFuncs["Black on Grey"] = () => {
            this.EvtChangeDefaultColor.fire(["black", "low"]);
            this.EvtChangeDefaultBgColor.fire(["white", "low"]);
        };

        this.clickFuncs["Black on White"] = () => {
            this.EvtChangeDefaultColor.fire(["black", "low"]);
            this.EvtChangeDefaultBgColor.fire(["white", "high"]);
        };

        this.clickFuncs["Script"] = () => {
            this.jsScriptWin.show();
        };

        this.clickFuncs["Export"] = () => {
            UserConfig.exportToFile();
        };

        this.clickFuncs["Import"] = () => {
            UserConfig.importFromFile();
        };

        this.clickFuncs["About"] = () => {
            this.aboutWin.show();
        };

        this.clickFuncs["Contact"] = () => {
            this.EvtContactClicked.fire(null);
        };
    }

    private handleClick(event: any) {
        let item = event.args;
        let text = $(item).text();
        if (text in this.clickFuncs) {
            this.clickFuncs[text]();
        }
    }

    handleTelnetConnect() {
        $("#menuBar-conn-disconn").text("Disconnect");
    }

    handleTelnetDisconnect() {
        $("#menuBar-conn-disconn").text("Connect");
    }
}
