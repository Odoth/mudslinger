import { GlEvent, EventHook } from "./event";

import { UserConfig } from "./userConfig";

import { JsScript } from "./jsScript";
import { TrigAlItem } from "./trigAlEditBase";


export class AliasManager {
    public evtAliasesChanged = new EventHook<void>();

    public aliases: Array<TrigAlItem> = null;

    constructor(private jsScript: JsScript) {
        /* backward compatibility */
        let savedAliases: string = localStorage.getItem("aliases");
        if (savedAliases) {
            UserConfig.set("aliases", JSON.parse(savedAliases));
            localStorage.removeItem("aliases");
        }

        this.loadAliases();

        UserConfig.evtConfigImport.handle(this.handleConfigImport, this);
    }

    public saveAliases() {
        UserConfig.set("aliases", this.aliases);
    }

    private loadAliases() {
        this.aliases = UserConfig.get("aliases") || [];
    }

    private handleConfigImport(imp: {[k: string]: any}) {
        this.aliases = this.aliases.concat(imp["aliases"] || []);
        this.saveAliases();
        this.evtAliasesChanged.fire(null);
    }

    // return the result of the alias if any (string with embedded lines)
    // return true if matched and script ran
    // return null if no match
    public checkAlias(cmd: string): boolean | string {
        if (UserConfig.getDef("aliasesEnabled", true) !== true) return null;

        for (let i = 0; i < this.aliases.length; i++) {
            let alias = this.aliases[i];

            if (alias.regex) {
                let re = alias.pattern;
                let match = cmd.match(re);
                if (!match) {
                    continue;
                }

                if (alias.is_script) {
                    let script = this.jsScript.makeScript(alias.value, "match, input");
                    if (script) { script(match, cmd); };
                    return true;
                } else {
                    let value = alias.value;

                    value = value.replace(/\$(\d+)/g, function(m, d) {
                        return match[parseInt(d)] || "";
                    });
                    return value;
                }
            } else {
                let re = "^" + alias.pattern + "\\s*(.*)$";
                let match = cmd.match(re);
                if (!match) {
                    continue;
                }

                if (alias.is_script) {
                    let script = this.jsScript.makeScript(alias.value, "input");
                    if (script) { script(cmd); };
                    return true;
                } else {
                    let value = alias.value.replace("$1", match[1] || "");
                    return value;
                }
            }
        }
        return null;
    };
}
