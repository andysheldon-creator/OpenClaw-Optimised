import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { saveMediaBuffer } from "../../media/store.js";
import { stringEnum } from "../schema/typebox.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";
import { imageResultFromFile, jsonResult, type AnyAgentTool, readStringParam } from "./common.js";

const COMPUTER_TOOL_ACTIONS = [
  "snapshot",
  "move",
  "click",
  "dblclick",
  "right_click",
  "scroll",
  "type",
  "hotkey",
  "press",
  "drag",
  "teach_start",
  "teach_finish",
  "teach_rename",
] as const;

type ComputerToolAction = (typeof COMPUTER_TOOL_ACTIONS)[number];

type TeachStep = {
  id: string;
  atMs: number;
  action: string;
  params: Record<string, unknown>;
};

type TeachState = {
  version: 1;
  startedAtMs: number;
  steps: TeachStep[];
  skillDir?: string;
};

const ComputerToolSchema = Type.Object({
  action: stringEnum(COMPUTER_TOOL_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),

  // Common action params
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  x2: Type.Optional(Type.Number()),
  y2: Type.Optional(Type.Number()),
  button: Type.Optional(stringEnum(["left", "right", "middle"] as const)),
  clicks: Type.Optional(Type.Number()),
  delayMs: Type.Optional(Type.Number()),

  // scroll
  deltaY: Type.Optional(Type.Number()),

  // type/hotkey/press
  text: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  ctrl: Type.Optional(Type.Boolean()),
  alt: Type.Optional(Type.Boolean()),
  shift: Type.Optional(Type.Boolean()),
  meta: Type.Optional(Type.Boolean()),

  // teach
  name: Type.Optional(Type.String()),
});

function encodePowerShell(script: string): string {
  // -EncodedCommand expects UTF-16LE.
  return Buffer.from(script, "utf16le").toString("base64");
}

async function runPowerShell(params: {
  script: string;
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const timeoutMs =
    typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
      ? Math.max(1, Math.floor(params.timeoutMs))
      : 30_000;

  const encoded = encodePowerShell(params.script);

  return await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

async function runPowerShellJson<T>(params: {
  script: string;
  timeoutMs?: number;
}): Promise<T> {
  const res = await runPowerShell(params);
  if (res.exitCode !== 0) {
    const message = res.stderr.trim() || res.stdout.trim() || `powershell exit ${res.exitCode}`;
    throw new Error(message);
  }
  const raw = res.stdout.trim();
  if (!raw) {
    throw new Error("powershell returned empty output");
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`powershell did not return JSON: ${String(err)}\n${raw.slice(0, 2000)}`);
  }
}

function requireNumber(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`${key} required`);
}

function resolveTeachStatePath(agentDir: string, sessionKey: string) {
  return path.join(agentDir, "computer-teach", `${sessionKey}.json`);
}

async function loadTeachState(params: {
  agentDir: string;
  sessionKey: string;
}): Promise<TeachState | null> {
  const filePath = resolveTeachStatePath(params.agentDir, params.sessionKey);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as TeachState;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return null;
    }
    if (!Array.isArray(parsed.steps)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveTeachState(params: {
  agentDir: string;
  sessionKey: string;
  state: TeachState;
}): Promise<void> {
  const filePath = resolveTeachStatePath(params.agentDir, params.sessionKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(params.state, null, 2), "utf-8");
}

function sanitizeSkillName(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return base.slice(0, 64) || "computer-skill";
}

function autoSkillName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").replace("Z", "");
  return sanitizeSkillName(`computer-use-${ts}-${crypto.randomUUID().slice(0, 8)}`);
}

async function ensureApproval(params: {
  gatewayOpts: GatewayCallOptions;
  command: string;
  timeoutMs?: number;
}): Promise<void> {
  const res = await callGatewayTool<{ decision?: string }>(
    "exec.approval.request",
    params.gatewayOpts,
    {
      id: crypto.randomUUID(),
      command: params.command,
      host: "computer",
      ask: "always",
      timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : 120_000,
    },
    { expectFinal: true },
  );
  const decision = res && typeof res === "object" ? (res as { decision?: string }).decision : null;
  if (decision === "deny") {
    throw new Error("computer action denied by user");
  }
  if (decision !== "allow-once" && decision !== "allow-always") {
    throw new Error("computer action approval missing");
  }
}

function shouldApproveAction(action: ComputerToolAction): boolean {
  if (action === "snapshot") {
    return false;
  }
  if (action.startsWith("teach_")) {
    return false;
  }
  return true;
}

function formatApprovalCommand(action: string, params: Record<string, unknown>): string {
  const allowedKeys = [
    "x",
    "y",
    "x2",
    "y2",
    "button",
    "clicks",
    "deltaY",
    "text",
    "key",
    "ctrl",
    "alt",
    "shift",
    "meta",
    "delayMs",
  ];
  const parts: string[] = [];
  for (const key of allowedKeys) {
    if (!(key in params)) {
      continue;
    }
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const clipped = trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
      parts.push(`${key}=${JSON.stringify(clipped)}`);
    } else {
      parts.push(`${key}=${JSON.stringify(value)}`);
    }
  }
  return `${action}${parts.length ? " " + parts.join(" ") : ""}`;
}

async function recordTeachStep(params: {
  agentDir: string;
  sessionKey: string;
  action: string;
  stepParams: Record<string, unknown>;
}): Promise<void> {
  const existing = await loadTeachState({ agentDir: params.agentDir, sessionKey: params.sessionKey });
  if (!existing) {
    return;
  }
  const next: TeachState = {
    ...existing,
    steps: [
      ...existing.steps,
      {
        id: crypto.randomUUID(),
        atMs: Date.now(),
        action: params.action,
        params: params.stepParams,
      },
    ],
  };
  await saveTeachState({ agentDir: params.agentDir, sessionKey: params.sessionKey, state: next });
}

async function writeSkillFromTeachState(params: {
  workspaceDir: string;
  state: TeachState;
}): Promise<{ skillName: string; skillDir: string }> {
  const skillName = autoSkillName();
  const skillDir = path.join(params.workspaceDir, "skills", skillName);
  await fs.mkdir(skillDir, { recursive: true });

  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${skillName}`);
  lines.push('description: "Recorded Windows desktop automation steps (computer tool)."');
  lines.push("---");
  lines.push("");
  lines.push("# Recorded Desktop Flow");
  lines.push("");
  lines.push("This skill was generated from an interactive teaching session.");
  lines.push("");
  lines.push("## How To Run");
  lines.push("");
  lines.push("Repeat the loop: take a snapshot, then perform one action, then re-snapshot.");
  lines.push("");
  lines.push("## Steps");
  lines.push("");

  const steps = params.state.steps;
  if (steps.length === 0) {
    lines.push("(No steps were recorded.)");
  } else {
    for (const [i, step] of steps.entries()) {
      const details = JSON.stringify(step.params);
      lines.push(`${i + 1}. ${step.action} ${details}`);
    }
  }
  lines.push("");

  await fs.writeFile(path.join(skillDir, "SKILL.md"), lines.join("\n"), "utf-8");
  return { skillName, skillDir };
}

async function renameSkillDir(params: {
  workspaceDir: string;
  fromName: string;
  toName: string;
}): Promise<{ fromDir: string; toDir: string }> {
  const safeTo = sanitizeSkillName(params.toName);
  if (!safeTo) {
    throw new Error("name required");
  }
  const fromDir = path.join(params.workspaceDir, "skills", params.fromName);
  const toDir = path.join(params.workspaceDir, "skills", safeTo);
  await fs.rename(fromDir, toDir);
  const skillMdPath = path.join(toDir, "SKILL.md");
  const raw = await fs.readFile(skillMdPath, "utf-8");
  const updated = raw.replace(/^name:\s*.*$/m, `name: ${safeTo}`);
  await fs.writeFile(skillMdPath, updated, "utf-8");
  return { fromDir, toDir };
}

async function resolveSnapshot(): Promise<{
  base64: string;
  width: number;
  height: number;
  cursorX?: number;
  cursorY?: number;
}> {
  const script = `
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Dpi {
  [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();
}
'@
[void][Dpi]::SetProcessDPIAware()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$base64 = [Convert]::ToBase64String($ms.ToArray())

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CursorPos {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport(\"user32.dll\")] public static extern bool GetCursorPos(out POINT pt);
}
'@
$pt = New-Object CursorPos+POINT
[void][CursorPos]::GetCursorPos([ref]$pt)

$out = @{ base64 = $base64; width = $bounds.Width; height = $bounds.Height; cursorX = $pt.X; cursorY = $pt.Y } | ConvertTo-Json -Compress
Write-Output $out
`;

  return await runPowerShellJson({ script, timeoutMs: 60_000 });
}

async function runInputAction(params: {
  action: string;
  args: Record<string, unknown>;
}): Promise<void> {
  const action = params.action;
  const json = JSON.stringify(params.args ?? {});
  const jsonB64 = Buffer.from(json, "utf-8").toString("base64");

  const script = `
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Dpi {
  [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();
}
'@
[void][Dpi]::SetProcessDPIAware()

Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Mouse {
  [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@

function Get-Args() {
  $b64 = '${jsonB64}'
  $raw = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
  return ($raw | ConvertFrom-Json)
}

$args = Get-Args
$delayMs = 0
if ($args.PSObject.Properties.Name -contains 'delayMs') { $delayMs = [int]$args.delayMs }

function Sleep-IfNeeded() {
  if ($delayMs -gt 0) { Start-Sleep -Milliseconds $delayMs }
}

function Escape-SendKeys([string]$text) {
  if (-not $text) { return $text }
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $text.ToCharArray()) {
    switch ($ch) {
      '+' { [void]$sb.Append('{+}') }
      '^' { [void]$sb.Append('{^}') }
      '%' { [void]$sb.Append('{%}') }
      '~' { [void]$sb.Append('{~}') }
      '(' { [void]$sb.Append('{(}') }
      ')' { [void]$sb.Append('{)}') }
      '[' { [void]$sb.Append('{[}') }
      ']' { [void]$sb.Append('{]}') }
      '{' { [void]$sb.Append('{{}') }
      '}' { [void]$sb.Append('{}}') }
      default { [void]$sb.Append($ch) }
    }
  }
  return $sb.ToString()
}

switch ('${action}') {
  'move' {
    [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    Sleep-IfNeeded
  }
  'click' {
    [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    [Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
    [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
    Sleep-IfNeeded
  }
  'dblclick' {
    [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    1..2 | ForEach-Object {
      [Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
      [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 60
    }
    Sleep-IfNeeded
  }
  'right_click' {
    [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    [Mouse]::mouse_event(0x0008, 0, 0, 0, 0)
    [Mouse]::mouse_event(0x0010, 0, 0, 0, 0)
    Sleep-IfNeeded
  }
  'scroll' {
    if ($args.PSObject.Properties.Name -contains 'x' -and $args.PSObject.Properties.Name -contains 'y') {
      [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    }
    $delta = [int]$args.deltaY
    [Mouse]::mouse_event(0x0800, 0, 0, $delta, 0)
    Sleep-IfNeeded
  }
  'drag' {
    [void][Mouse]::SetCursorPos([int]$args.x, [int]$args.y)
    [Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 50
    [void][Mouse]::SetCursorPos([int]$args.x2, [int]$args.y2)
    Start-Sleep -Milliseconds 50
    [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
    Sleep-IfNeeded
  }
  'type' {
    if (-not ($args.PSObject.Properties.Name -contains 'text')) { throw 'text required' }
    $text = [string]$args.text
    if ($text.Length -gt 0) {
      [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $text))
    }
    Sleep-IfNeeded
  }
  'hotkey' {
    $key = [string]$args.key
    if (-not $key) { throw 'key required' }
    $ctrl = $false; $alt = $false; $shift = $false
    if ($args.PSObject.Properties.Name -contains 'ctrl') { $ctrl = [bool]$args.ctrl }
    if ($args.PSObject.Properties.Name -contains 'alt') { $alt = [bool]$args.alt }
    if ($args.PSObject.Properties.Name -contains 'shift') { $shift = [bool]$args.shift }

    $prefix = ''
    if ($ctrl) { $prefix += '^' }
    if ($alt) { $prefix += '%' }
    if ($shift) { $prefix += '+' }
    [System.Windows.Forms.SendKeys]::SendWait($prefix + $key)
    Sleep-IfNeeded
  }
  'press' {
    $key = [string]$args.key
    if (-not $key) { throw 'key required' }
    [System.Windows.Forms.SendKeys]::SendWait($key)
    Sleep-IfNeeded
  }
  default {
    throw 'unsupported action'
  }
}

@{ ok = $true } | ConvertTo-Json -Compress | Write-Output
`;

  await runPowerShellJson({ script, timeoutMs: 30_000 });
}

export function createComputerTool(options?: {
  agentSessionKey?: string;
  agentDir?: string;
  workspaceDir?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  const sessionKey = options?.agentSessionKey?.trim() || "main";
  const agentDir = options?.agentDir?.trim() || undefined;
  const workspaceDir = options?.workspaceDir?.trim() || undefined;

  return {
    label: "Computer",
    name: "computer",
    description:
      "Windows-only computer use: take screenshots and control mouse/keyboard. Actions require approval via Web UI.",
    parameters: ComputerToolSchema,
    execute: async (_toolCallId, args) => {
      if (process.platform !== "win32") {
        throw new Error("computer tool is only supported on Windows");
      }

      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as ComputerToolAction;
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };

      if (action === "snapshot") {
        const snap = await resolveSnapshot();
        const buffer = Buffer.from(snap.base64, "base64");
        const saved = await saveMediaBuffer(buffer, "image/png", "computer", 20 * 1024 * 1024);
        return await imageResultFromFile({
          label: "computer.snapshot",
          path: saved.path,
          details: {
            width: snap.width,
            height: snap.height,
            cursorX: snap.cursorX,
            cursorY: snap.cursorY,
          },
        });
      }

      if (action === "teach_start") {
        if (!agentDir) {
          throw new Error("agentDir required for teach mode");
        }
        const next: TeachState = {
          version: 1,
          startedAtMs: Date.now(),
          steps: [],
        };
        await saveTeachState({ agentDir, sessionKey, state: next });
        return jsonResult({ ok: true, status: "teach-started" });
      }

      if (action === "teach_finish") {
        if (!agentDir) {
          throw new Error("agentDir required for teach mode");
        }
        if (!workspaceDir) {
          throw new Error("workspaceDir required for teach mode");
        }
        const state = await loadTeachState({ agentDir, sessionKey });
        if (!state) {
          throw new Error("teach mode not started");
        }
        const out = await writeSkillFromTeachState({ workspaceDir, state });
        const updated: TeachState = { ...state, skillDir: out.skillDir };
        await saveTeachState({ agentDir, sessionKey, state: updated });
        return jsonResult({ ok: true, status: "teach-finished", ...out });
      }

      if (action === "teach_rename") {
        if (!agentDir) {
          throw new Error("agentDir required for teach mode");
        }
        if (!workspaceDir) {
          throw new Error("workspaceDir required for teach mode");
        }
        const state = await loadTeachState({ agentDir, sessionKey });
        if (!state?.skillDir) {
          throw new Error("teach session has no generated skill yet (run teach_finish first)");
        }
        const fromName = path.basename(state.skillDir);
        const toName = readStringParam(params, "name", { required: true });
        const renamed = await renameSkillDir({ workspaceDir, fromName, toName });
        const next: TeachState = { ...state, skillDir: renamed.toDir };
        await saveTeachState({ agentDir, sessionKey, state: next });
        return jsonResult({ ok: true, status: "teach-renamed", toName: path.basename(renamed.toDir) });
      }

      if (shouldApproveAction(action)) {
        const approvalText = formatApprovalCommand(`computer.${action}`, params);
        await ensureApproval({ gatewayOpts, command: approvalText, timeoutMs: 120_000 });
      }

      const delayMs =
        typeof params.delayMs === "number" && Number.isFinite(params.delayMs)
          ? Math.max(0, Math.floor(params.delayMs))
          : undefined;

      if (action === "move") {
        const x = requireNumber(params, "x");
        const y = requireNumber(params, "y");
        await runInputAction({ action: "move", args: { x, y, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "move", stepParams: { x, y, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "click") {
        const x = requireNumber(params, "x");
        const y = requireNumber(params, "y");
        await runInputAction({ action: "click", args: { x, y, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "click", stepParams: { x, y, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "dblclick") {
        const x = requireNumber(params, "x");
        const y = requireNumber(params, "y");
        await runInputAction({ action: "dblclick", args: { x, y, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "dblclick", stepParams: { x, y, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "right_click") {
        const x = requireNumber(params, "x");
        const y = requireNumber(params, "y");
        await runInputAction({ action: "right_click", args: { x, y, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "right_click", stepParams: { x, y, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "scroll") {
        const deltaY = requireNumber(params, "deltaY");
        const x = typeof params.x === "number" ? params.x : undefined;
        const y = typeof params.y === "number" ? params.y : undefined;
        await runInputAction({
          action: "scroll",
          args: { ...(x !== undefined && y !== undefined ? { x, y } : {}), deltaY, delayMs },
        });
        if (agentDir) {
          await recordTeachStep({
            agentDir,
            sessionKey,
            action: "scroll",
            stepParams: { ...(x !== undefined && y !== undefined ? { x, y } : {}), deltaY, delayMs },
          });
        }
        return jsonResult({ ok: true });
      }

      if (action === "drag") {
        const x = requireNumber(params, "x");
        const y = requireNumber(params, "y");
        const x2 = requireNumber(params, "x2");
        const y2 = requireNumber(params, "y2");
        await runInputAction({ action: "drag", args: { x, y, x2, y2, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "drag", stepParams: { x, y, x2, y2, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "type") {
        const text = readStringParam(params, "text", { required: true, allowEmpty: true });
        await runInputAction({ action: "type", args: { text, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "type", stepParams: { text, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      if (action === "hotkey") {
        const key = readStringParam(params, "key", { required: true });
        const ctrl = typeof params.ctrl === "boolean" ? params.ctrl : false;
        const alt = typeof params.alt === "boolean" ? params.alt : false;
        const shift = typeof params.shift === "boolean" ? params.shift : false;
        const meta = typeof params.meta === "boolean" ? params.meta : false;
        await runInputAction({ action: "hotkey", args: { key, ctrl, alt, shift, meta, delayMs } });
        if (agentDir) {
          await recordTeachStep({
            agentDir,
            sessionKey,
            action: "hotkey",
            stepParams: { key, ctrl, alt, shift, meta, delayMs },
          });
        }
        return jsonResult({ ok: true });
      }

      if (action === "press") {
        const key = readStringParam(params, "key", { required: true });
        await runInputAction({ action: "press", args: { key, delayMs } });
        if (agentDir) {
          await recordTeachStep({ agentDir, sessionKey, action: "press", stepParams: { key, delayMs } });
        }
        return jsonResult({ ok: true });
      }

      throw new Error(`unsupported computer action: ${action}`);
    },
  };
}
