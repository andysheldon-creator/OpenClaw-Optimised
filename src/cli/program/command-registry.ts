import type { Command } from "commander";
import type { ProgramContext } from "./context.js";

type CommandRegisterParams = {
  program: Command;
  ctx: ProgramContext;
  argv: string[];
};

type CommandRegistration = {
  id: string;
  register: (params: CommandRegisterParams) => Promise<void>;
};

const commandRegistry: CommandRegistration[] = [
  {
    id: "setup",
    register: async ({ program }) => {
      const { registerSetupCommand } = await import("./register.setup.js");
      registerSetupCommand(program);
    },
  },
  {
    id: "onboard",
    register: async ({ program }) => {
      const { registerOnboardCommand } = await import("./register.onboard.js");
      registerOnboardCommand(program);
    },
  },
  {
    id: "configure",
    register: async ({ program }) => {
      const { registerConfigureCommand } = await import("./register.configure.js");
      registerConfigureCommand(program);
    },
  },
  {
    id: "config",
    register: async ({ program }) => {
      const { registerConfigCli } = await import("../config-cli.js");
      registerConfigCli(program);
    },
  },
  {
    id: "maintenance",
    register: async ({ program }) => {
      const { registerMaintenanceCommands } = await import("./register.maintenance.js");
      registerMaintenanceCommands(program);
    },
  },
  {
    id: "message",
    register: async ({ program, ctx }) => {
      const { registerMessageCommands } = await import("./register.message.js");
      registerMessageCommands(program, ctx);
    },
  },
  {
    id: "memory",
    register: async ({ program }) => {
      const { registerMemoryCli } = await import("../memory-cli.js");
      registerMemoryCli(program);
    },
  },
  {
    id: "agent",
    register: async ({ program, ctx }) => {
      const { registerAgentCommands } = await import("./register.agent.js");
      registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
    },
  },
  {
    id: "subclis",
    register: async ({ program, argv }) => {
      const { registerSubCliCommands } = await import("./register.subclis.js");
      registerSubCliCommands(program, argv);
    },
  },
  {
    id: "status-health-sessions",
    register: async ({ program }) => {
      const { registerStatusHealthSessionsCommands } =
        await import("./register.status-health-sessions.js");
      registerStatusHealthSessionsCommands(program);
    },
  },
  {
    id: "browser",
    register: async ({ program }) => {
      const { registerBrowserCli } = await import("../browser-cli.js");
      registerBrowserCli(program);
    },
  },
];

export async function registerProgramCommands(
  program: Command,
  ctx: ProgramContext,
  argv: string[] = process.argv,
) {
  await Promise.all(commandRegistry.map((entry) => entry.register({ program, ctx, argv })));
}
