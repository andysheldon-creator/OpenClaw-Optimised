/**
 * Feishu CLI commands
 * @module cli/feishu-cli
 */

import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { danger, success, warn } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import {
  listFeishuAccountIds,
  resolveFeishuAccount,
  listEnabledFeishuAccounts,
} from "../feishu/accounts.js";
import { probeFeishuBot } from "../feishu/probe.js";

function runFeishuCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action);
}

function runFeishuCommandWithDanger(action: () => Promise<void>, label: string) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(`${label}: ${String(err)}`));
    defaultRuntime.exit(1);
  });
}

export function registerFeishuCli(program: Command) {
  const feishu = program.command("feishu").description("Manage Feishu channel accounts");

  // List command
  feishu
    .command("list")
    .description("List configured Feishu accounts")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runFeishuCommand(async () => {
        const cfg = loadConfig();
        // DEBUG LOG
        console.log("DEBUG: Config loaded from:", process.cwd());
        console.log("DEBUG: Config channels keys:", Object.keys(cfg.channels || {}));
        console.log("DEBUG: Feishu config present:", !!cfg.channels?.feishu);
        if (cfg.channels?.feishu) {
          console.log("DEBUG: Feishu accounts:", Object.keys(cfg.channels.feishu.accounts || {}));
        }

        const accountIds = listFeishuAccountIds(cfg);

        if (opts.json) {
          const accounts = accountIds.map((id) => {
            try {
              const account = resolveFeishuAccount({ cfg, accountId: id });
              return {
                accountId: account.accountId,
                name: account.name,
                enabled: account.enabled,
                appId: account.appId,
                tokenSource: account.tokenSource,
              };
            } catch (err) {
              return { accountId: id, error: String(err) };
            }
          });
          defaultRuntime.log(JSON.stringify(accounts, null, 2));
          return;
        }

        if (accountIds.length === 0) {
          defaultRuntime.log(warn("No Feishu accounts configured."));
          return;
        }

        defaultRuntime.log(theme.heading("\n📱 Feishu Accounts\n"));
        for (const id of accountIds) {
          try {
            const account = resolveFeishuAccount({ cfg, accountId: id });
            const status = account.enabled ? success("✓ enabled") : danger("✗ disabled");
            defaultRuntime.log(`  ${theme.accent(account.accountId)} ${status}`);
            if (account.name) {
              defaultRuntime.log(`    Name: ${account.name}`);
            }
            defaultRuntime.log(`    App ID: ${account.appId}`);
            defaultRuntime.log(`    Token Source: ${account.tokenSource}`);
          } catch (err) {
            defaultRuntime.log(`  ${theme.accent(id)} ${danger("✗ error")}`);
            defaultRuntime.log(`    ${danger(String(err))}`);
          }
        }
        defaultRuntime.log("");
      });
    });

  // Status command
  feishu
    .command("status")
    .description("Show Feishu account status")
    .option("--account <id>", "Account id")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runFeishuCommand(async () => {
        const cfg = loadConfig();
        const accounts = listEnabledFeishuAccounts(cfg);

        if (accounts.length === 0) {
          if (opts.json) {
            defaultRuntime.log(JSON.stringify({ status: "no_accounts" }));
          } else {
            defaultRuntime.log(warn("No enabled Feishu accounts."));
          }
          return;
        }

        const targetAccounts = opts.account
          ? accounts.filter((a) => a.accountId === opts.account)
          : accounts;

        if (targetAccounts.length === 0) {
          if (opts.json) {
            defaultRuntime.log(JSON.stringify({ status: "account_not_found" }));
          } else {
            defaultRuntime.log(danger(`Account "${opts.account}" not found.`));
          }
          return;
        }

        const results = [];
        for (const account of targetAccounts) {
          results.push({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            appId: account.appId,
            tokenSource: account.tokenSource,
            connectionMode: account.config.useLongConnection ? "long-connection" : "webhook",
          });
        }

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(results, null, 2));
        } else {
          defaultRuntime.log(theme.heading("\n📊 Feishu Status\n"));
          for (const r of results) {
            defaultRuntime.log(`  ${theme.accent(r.accountId)}`);
            defaultRuntime.log(
              `    Status: ${r.enabled ? success("enabled") : danger("disabled")}`,
            );
            defaultRuntime.log(`    App ID: ${r.appId}`);
            defaultRuntime.log(`    Connection: ${r.connectionMode}`);
            defaultRuntime.log("");
          }
        }
      });
    });

  // Probe command
  feishu
    .command("probe")
    .description("Test Feishu bot connection")
    .option("--account <id>", "Account id")
    .option("--timeout <ms>", "Timeout in ms", "10000")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runFeishuCommandWithDanger(async () => {
        const cfg = loadConfig();
        const accountId = opts.account;
        // const timeout = parseInt(opts.timeout, 10) || 10000;

        if (!opts.json) {
          defaultRuntime.log(theme.muted("Probing Feishu bot..."));
        }

        const account = resolveFeishuAccount({ cfg, accountId });
        const result = await probeFeishuBot(account);

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.ok) {
          defaultRuntime.log(success("\n✓ Feishu bot connection successful!\n"));
          if (result.bot?.appName) {
            defaultRuntime.log(`  App Name: ${result.bot.appName}`);
          }
          if (result.bot?.openId) {
            defaultRuntime.log(`  Bot Open ID: ${result.bot.openId}`);
          }
        } else {
          defaultRuntime.log(danger("\n✗ Feishu bot connection failed!\n"));
          if (result.error) {
            defaultRuntime.log(`  Error: ${result.error}`);
          }
        }
        defaultRuntime.log("");
      }, "Feishu probe failed");
    });
}
