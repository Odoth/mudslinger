import { EventHook } from "./event";
import { apiPostConfigExport, apiPostConfigImport } from "./apiUtil";


export namespace UserConfig {
    export const evtConfigImport = new EventHook<{[k: string]: any}>();

    let cfgVals: {[k: string]: any};
    let setHandlers: {[k: string]: EventHook<any>} = {};

    {
        let userConfigStr = localStorage.getItem("userConfig");

        if (userConfigStr) {
            cfgVals = JSON.parse(userConfigStr);
        } else {
            cfgVals = {};
        }
    }

    export function onSet(key: string, cb: (val: any) => void) {
        if (key in setHandlers === false) {
            setHandlers[key] = new EventHook<any>();
        }
        setHandlers[key].handle(cb);
    }

    export function getDef(key: string, def: any): any {
        let res = cfgVals[key];
        return (res === undefined) ? def : res;
    }

    export function get(key: string): any {
        return cfgVals[key];
    }

    export function set(key: string, val: any) {
        cfgVals[key] = val;
        saveConfig();
        if (key in setHandlers) {
            setHandlers[key].fire(val);
        }
    }

    function saveConfig() {
        localStorage.setItem("userConfig", JSON.stringify(cfgVals));
    }

    export function exportToFile() {
        let data = "data:text/json;charset=utf-8," + JSON.stringify(cfgVals);
        let uri = encodeURI(data);
        let link = document.createElement("a");
        link.setAttribute("href", uri);
        link.setAttribute("download", "userConfig.json");
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        apiPostConfigExport();
    }

    export function importFromFile() {
        let inp: HTMLInputElement = document.createElement("input");
        inp.type = "file";
        inp.style.visibility = "hidden";

        inp.addEventListener("change", (e: any) => {
            let file = e.target.files[0];
            if (!file) {
                return;
            }

            let reader = new FileReader();
            reader.onload = (e1: any) => {
                let text = e1.target.result;
                let vals = JSON.parse(text);
                // cfgVals = vals;
                evtConfigImport.fire(vals);
                // saveConfig();
            };
            reader.readAsText(file);

            apiPostConfigImport();
        });

        document.body.appendChild(inp);
        inp.click();
        document.body.removeChild(inp);
    }
}
