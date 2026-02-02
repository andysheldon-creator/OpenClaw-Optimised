/* eslint-disable */
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

const { platform, arch } = process;

let nativeBinding = null;
let localFileExisted = false;
let loadError = null;

function isMusl() {
  if (!process.report || typeof process.report.getReport !== "function") {
    try {
      const lddPath = require("child_process").execSync("which ldd").toString().trim();
      return readFileSync(lddPath, "utf8").includes("musl");
    } catch {
      return true;
    }
  } else {
    const report = process.report.getReport();
    const glibcVersionRuntime = report?.header?.glibcVersionRuntime;
    return !glibcVersionRuntime;
  }
}

switch (platform) {
  case "linux":
    switch (arch) {
      case "x64":
        if (isMusl()) {
          localFileExisted = existsSync(join(__dirname, "compaction.linux-x64-musl.node"));
        } else {
          localFileExisted = existsSync(join(__dirname, "compaction.linux-x64-gnu.node"));
        }
        try {
          if (localFileExisted) {
            nativeBinding = require(isMusl()
              ? "./compaction.linux-x64-musl.node"
              : "./compaction.linux-x64-gnu.node");
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case "arm64":
        if (isMusl()) {
          localFileExisted = existsSync(join(__dirname, "compaction.linux-arm64-musl.node"));
        } else {
          localFileExisted = existsSync(join(__dirname, "compaction.linux-arm64-gnu.node"));
        }
        try {
          if (localFileExisted) {
            nativeBinding = require(isMusl()
              ? "./compaction.linux-arm64-musl.node"
              : "./compaction.linux-arm64-gnu.node");
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on Linux: ${arch}`);
    }
    break;
  case "darwin":
    switch (arch) {
      case "x64":
        localFileExisted = existsSync(join(__dirname, "compaction.darwin-x64.node"));
        try {
          if (localFileExisted) {
            nativeBinding = require("./compaction.darwin-x64.node");
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case "arm64":
        localFileExisted = existsSync(join(__dirname, "compaction.darwin-arm64.node"));
        try {
          if (localFileExisted) {
            nativeBinding = require("./compaction.darwin-arm64.node");
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on macOS: ${arch}`);
    }
    break;
  case "win32":
    switch (arch) {
      case "x64":
        localFileExisted = existsSync(join(__dirname, "compaction.win32-x64-msvc.node"));
        try {
          if (localFileExisted) {
            nativeBinding = require("./compaction.win32-x64-msvc.node");
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on Windows: ${arch}`);
    }
    break;
  default:
    throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`);
}

if (!nativeBinding) {
  if (loadError) {
    throw loadError;
  }
  throw new Error(`Failed to load native binding`);
}

module.exports = nativeBinding;
