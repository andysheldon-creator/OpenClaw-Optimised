import { Command, Option } from "commander";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatDocsLink } from "../terminal/links.js";
import { resolveCliName } from "./cli-name.js";
import { getSubCliEntries, registerSubCliByName } from "./program/register.subclis.js";

export function registerCompletionCli(program: Command) {
  program
    .command("completion")
    .description("Generate shell completion script")
    .addHelpText(
      "after",
      () => `\n${formatDocsLink("/cli/completion", "docs.openclaw.ai/cli/completion")}\n`,
    )
    .addOption(
      new Option("-s, --shell <shell>", "Shell to generate completion for")
        .choices(["zsh", "bash", "powershell", "fish"])
        .default("zsh"),
    )
    .option("-i, --install", "Install completion script to shell profile")
    .option("-y, --yes", "Skip confirmation (non-interactive)", false)
    .action(async (options) => {
      const shell = options.shell;
      // Eagerly register all subcommands to build the full tree
      const entries = getSubCliEntries();
      for (const entry of entries) {
        // Skip completion command itself to avoid cycle if we were to add it to the list
        if (entry.name === "completion") {
          continue;
        }
        await registerSubCliByName(program, entry.name);
      }

      const script = renderCompletionScript(shell, program);
      if (options.install) {
        await installCompletion(shell, Boolean(options.yes), program.name(), script);
        return;
      }

      console.log(script);
    });
}

export async function installCompletion(
  shell: string,
  yes: boolean,
  binName = "openclaw",
  script?: string,
) {
  const home = process.env.HOME || os.homedir();
  let profilePath = "";
  let sourceLine = "";
  let completionPath = "";
  const completionDir = path.join(home, ".openclaw", "completions");

  if (shell === "zsh") {
    profilePath = path.join(home, ".zshrc");
    completionPath = path.join(completionDir, `${binName}.zsh`);
    sourceLine = `source "${completionPath}"`;
  } else if (shell === "bash") {
    // Try .bashrc first, then .bash_profile
    profilePath = path.join(home, ".bashrc");
    try {
      await fs.access(profilePath);
    } catch {
      profilePath = path.join(home, ".bash_profile");
    }
    completionPath = path.join(completionDir, `${binName}.bash`);
    sourceLine = `source "${completionPath}"`;
  } else if (shell === "fish") {
    profilePath = path.join(home, ".config", "fish", "config.fish");
    completionPath = path.join(completionDir, `${binName}.fish`);
    sourceLine = `source "${completionPath}"`;
  } else {
    console.error(`Automated installation not supported for ${shell} yet.`);
    return;
  }

  try {
    const cliName = resolveCliName();
    let cachedScript: string | undefined;
    const getScript = () => {
      if (cachedScript !== undefined) {
        return cachedScript;
      }
      cachedScript = script ?? getCompletionScriptFromCli(shell, binName, cliName);
      return cachedScript;
    };
    const ensureCompletionFile = async (): Promise<boolean> => {
      if (await pathExists(completionPath)) {
        return true;
      }
      const completionScript = getScript();
      if (!completionScript.trim()) {
        console.error("Failed to generate completion script.");
        return false;
      }
      await fs.mkdir(completionDir, { recursive: true });
      await fs.writeFile(completionPath, completionScript, "utf-8");
      return true;
    };

    // Check if profile exists
    try {
      await fs.access(profilePath);
    } catch {
      if (!yes) {
        console.warn(`Profile not found at ${profilePath}. Created a new one.`);
      }
      await fs.mkdir(path.dirname(profilePath), { recursive: true });
      await fs.writeFile(profilePath, "", "utf-8");
    }

    const content = await fs.readFile(profilePath, "utf-8");
    if (content.includes(sourceLine)) {
      if (!(await ensureCompletionFile())) {
        return;
      }
      if (!yes) {
        console.log(`Completion already installed in ${profilePath}`);
      }
      return;
    }

    const updatedContent = replaceLegacyCompletionLine(content, shell, binName, sourceLine);
    if (updatedContent !== content) {
      if (!(await ensureCompletionFile())) {
        return;
      }
      await fs.writeFile(profilePath, updatedContent, "utf-8");
      console.log(`Completion updated in ${profilePath}`);
      return;
    }

    if (!yes) {
      // Simple confirmation could go here if we had a prompter,
      // but for now we assume --yes or manual invocation implies consent or we print info.
      // Since we don't have a prompter passed in here easily without adding deps, we'll log.
      console.log(`Installing completion to ${profilePath}...`);
    }

    if (!(await ensureCompletionFile())) {
      return;
    }
    await fs.appendFile(profilePath, `\n# ${formatCompletionHeader(binName)}\n${sourceLine}\n`);
    console.log(`Completion installed. Restart your shell or run: source ${profilePath}`);
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`Failed to install completion: ${message}`);
  }
}

function renderCompletionScript(shell: string, program: Command): string {
  if (shell === "zsh") {
    return generateZshCompletion(program);
  }
  if (shell === "bash") {
    return generateBashCompletion(program);
  }
  if (shell === "powershell") {
    return generatePowerShellCompletion(program);
  }
  if (shell === "fish") {
    return generateFishCompletion(program);
  }
  return "";
}

function getCompletionScriptFromCli(shell: string, binName: string, cliName: string): string {
  const env = { ...process.env };
  const args = ["completion", "--shell", shell];
  const attempts: Array<{ label: string; result: ReturnType<typeof spawnSync> }> = [];
  attempts.push({
    label: binName,
    result: spawnSync(binName, args, { encoding: "utf-8", env }),
  });
  const argv1 = process.argv[1];
  if (argv1 && argv1 !== binName && argv1 !== cliName) {
    attempts.push({
      label: `${process.execPath} ${argv1}`,
      result: spawnSync(process.execPath, [argv1, ...args], { encoding: "utf-8", env }),
    });
  }
  if (cliName !== binName) {
    attempts.push({
      label: cliName,
      result: spawnSync(cliName, args, { encoding: "utf-8", env }),
    });
  }
  const success = attempts.find((entry) => entry.result.status === 0);
  if (success) {
    return success.result.stdout?.toString() ?? "";
  }
  const last = attempts.at(-1);
  const stderr = last?.result.stderr?.toString().trim();
  const exitCode = last?.result.status ?? "unknown";
  const name = last?.label ?? binName;
  console.error(`Failed to generate completion (${name}, exit ${exitCode}).`);
  if (stderr) {
    console.error(stderr);
  }
  return "";
}

function formatCompletionHeader(binName: string) {
  if (!binName.trim()) {
    return "OpenClaw Completion";
  }
  const label = binName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  return `${label} Completion`;
}

function replaceLegacyCompletionLine(
  content: string,
  shell: string,
  binName: string,
  replacement: string,
): string {
  const legacyPattern =
    shell === "fish"
      ? new RegExp(`^\\s*${escapeRegExp(binName)}\\s+completion\\b.*\\|\\s*source\\s*$`, "gm")
      : new RegExp(`^\\s*source\\s+<\\(${escapeRegExp(binName)}\\s+completion\\b.*\\)\\s*$`, "gm");
  return content.replace(legacyPattern, replacement);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function generateZshCompletion(program: Command): string {
  const rootCmd = program.name();
  const script = `
#compdef ${rootCmd}

_${rootCmd}_root_completion() {
  local -a commands
  local -a options
  
  _arguments -C \\
    ${generateZshArgs(program)} \\
    ${generateZshSubcmdList(program)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${program.commands.map((cmd) => `(${cmd.name()}) _${rootCmd}_${cmd.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}

${generateZshSubcommands(program, rootCmd)}

compdef _${rootCmd}_root_completion ${rootCmd}
`;
  return script;
}

function generateZshArgs(cmd: Command): string {
  return (cmd.options || [])
    .map((opt) => {
      const flags = opt.flags.split(/[ ,|]+/);
      const name = flags.find((f) => f.startsWith("--")) || flags[0];
      const short = flags.find((f) => f.startsWith("-") && !f.startsWith("--"));
      const desc = opt.description.replace(/'/g, "'\\''");
      if (short) {
        return `"(${name} ${short})"{${name},${short}}"[${desc}]"`;
      }
      return `"${name}[${desc}]"`;
    })
    .join(" \\\n    ");
}

function generateZshSubcmdList(cmd: Command): string {
  const list = cmd.commands
    .map((c) => {
      const desc = c
        .description()
        .replace(/'/g, "'\\''")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");
      return `'${c.name()}[${desc}]'`;
    })
    .join(" ");
  return `"1: :_values 'command' ${list}"`;
}

function generateZshSubcommands(program: Command, prefix: string): string {
  let script = "";
  for (const cmd of program.commands) {
    const cmdName = cmd.name();
    const funcName = `_${prefix}_${cmdName.replace(/-/g, "_")}`;

    // Recurse first
    script += generateZshSubcommands(cmd, `${prefix}_${cmdName.replace(/-/g, "_")}`);

    const subCommands = cmd.commands;
    if (subCommands.length > 0) {
      script += `
${funcName}() {
  local -a commands
  local -a options
  
  _arguments -C \\
    ${generateZshArgs(cmd)} \\
    ${generateZshSubcmdList(cmd)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${subCommands.map((sub) => `(${sub.name()}) ${funcName}_${sub.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}
`;
    } else {
      script += `
${funcName}() {
  _arguments -C \\
    ${generateZshArgs(cmd)}
}
`;
    }
  }
  return script;
}

function generateBashCompletion(program: Command): string {
  // Simplified Bash completion using dynamic iteration logic (often hardcoded in static scripts)
  // For a robust implementation, usually one maps out the tree.
  // This assumes a simple structure.
  const rootCmd = program.name();

  // We can use a recursive function to build the case statements
  return `
_${rootCmd}_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Simple top-level completion for now
    opts="${program.commands.map((c) => c.name()).join(" ")} ${program.options.map((o) => o.flags.split(" ")[0]).join(" ")}"
    
    case "\${prev}" in
      ${program.commands.map((cmd) => generateBashSubcommand(cmd)).join("\n      ")}
    esac

    if [[ \${cur} == -* ]] ; then
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi
    
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
}

complete -F _${rootCmd}_completion ${rootCmd}
`;
}

function generateBashSubcommand(cmd: Command): string {
  // This is a naive implementation; fully recursive bash completion is complex to generate as a single string without improved state tracking.
  // For now, let's provide top-level command recognition.
  return `${cmd.name()})
        opts="${cmd.commands.map((c) => c.name()).join(" ")} ${cmd.options.map((o) => o.flags.split(" ")[0]).join(" ")}"
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
        ;;`;
}

function generatePowerShellCompletion(program: Command): string {
  const rootCmd = program.name();

  const visit = (cmd: Command, parents: string[]): string => {
    const cmdName = cmd.name();
    const fullPath = [...parents, cmdName].join(" ");

    let script = "";

    // Command completion for this level
    const subCommands = cmd.commands.map((c) => c.name());
    const options = cmd.options.map((o) => o.flags.split(/[ ,|]+/)[0]); // Take first flag
    const allCompletions = [...subCommands, ...options].map((s) => `'${s}'`).join(",");

    if (allCompletions.length > 0) {
      script += `
            if ($commandPath -eq '${fullPath}') {
                $completions = @(${allCompletions})
                $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
                }
            }
`;
    }

    // Recurse
    for (const sub of cmd.commands) {
      script += visit(sub, [...parents, cmdName]);
    }

    return script;
  };

  const rootBody = visit(program, []);

  return `
Register-ArgumentCompleter -Native -CommandName ${rootCmd} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commandElements = $commandAst.CommandElements
    $commandPath = ""
    
    # Reconstruct command path (simple approximation)
    # Skip the executable name
    for ($i = 1; $i -lt $commandElements.Count; $i++) {
        $element = $commandElements[$i].Extent.Text
        if ($element -like "-*") { break }
        if ($i -eq $commandElements.Count - 1 -and $wordToComplete -ne "") { break } # Don't include current word being typed
        $commandPath += "$element "
    }
    $commandPath = $commandPath.Trim()
    
    # Root command
    if ($commandPath -eq "") {
         $completions = @(${program.commands.map((c) => `'${c.name()}'`).join(",")}, ${program.options.map((o) => `'${o.flags.split(" ")[0]}'`).join(",")}) 
         $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
         }
    }
    
    ${rootBody}
}
`;
}

function generateFishCompletion(program: Command): string {
  const rootCmd = program.name();
  let script = "";

  const visit = (cmd: Command, parents: string[]) => {
    const cmdName = cmd.name();
    const fullPath = [...parents];
    if (parents.length > 0) {
      fullPath.push(cmdName);
    } // Only push if not root, or consistent root handling

    // Fish uses 'seen_subcommand_from' to determine context.
    // For root: complete -c openclaw -n "__fish_use_subcommand" -a "subcmd" -d "desc"

    // Root logic
    if (parents.length === 0) {
      // Subcommands of root
      for (const sub of cmd.commands) {
        const desc = sub.description().replace(/'/g, "'\\''");
        script += `complete -c ${rootCmd} -n "__fish_use_subcommand" -a "${sub.name()}" -d '${desc}'\n`;
      }
      // Options of root
      for (const opt of cmd.options) {
        const flags = opt.flags.split(/[ ,|]+/);
        const long = flags.find((f) => f.startsWith("--"))?.replace(/^--/, "");
        const short = flags
          .find((f) => f.startsWith("-") && !f.startsWith("--"))
          ?.replace(/^-/, "");
        const desc = opt.description.replace(/'/g, "'\\''");
        let line = `complete -c ${rootCmd} -n "__fish_use_subcommand"`;
        if (short) {
          line += ` -s ${short}`;
        }
        if (long) {
          line += ` -l ${long}`;
        }
        line += ` -d '${desc}'\n`;
        script += line;
      }
    } else {
      // Nested commands
      // Logic: if seen subcommand matches parents...
      // But fish completion logic is simpler if we just say "if we haven't seen THIS command yet but seen parent"
      // Actually, a robust fish completion often requires defining a function to check current line.
      // For simplicity, we'll assume standard fish helper __fish_seen_subcommand_from.

      // To properly scope to 'openclaw gateway' and not 'openclaw other gateway', we need to check the sequence.
      // A simplified approach:

      // Subcommands
      for (const sub of cmd.commands) {
        const desc = sub.description().replace(/'/g, "'\\''");
        script += `complete -c ${rootCmd} -n "__fish_seen_subcommand_from ${cmdName}" -a "${sub.name()}" -d '${desc}'\n`;
      }
      // Options
      for (const opt of cmd.options) {
        const flags = opt.flags.split(/[ ,|]+/);
        const long = flags.find((f) => f.startsWith("--"))?.replace(/^--/, "");
        const short = flags
          .find((f) => f.startsWith("-") && !f.startsWith("--"))
          ?.replace(/^-/, "");
        const desc = opt.description.replace(/'/g, "'\\''");
        let line = `complete -c ${rootCmd} -n "__fish_seen_subcommand_from ${cmdName}"`;
        if (short) {
          line += ` -s ${short}`;
        }
        if (long) {
          line += ` -l ${long}`;
        }
        line += ` -d '${desc}'\n`;
        script += line;
      }
    }

    for (const sub of cmd.commands) {
      visit(sub, [...parents, cmdName]);
    }
  };

  visit(program, []);
  return script;
}
