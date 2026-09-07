import { spawnSync } from "node:child_process";
import {
  existsSync,
  realpathSync,
} from "node:fs";
import {
  delimiter,
  dirname,
  resolve,
} from "node:path";
import { homedir } from "node:os";

function dotnetExecutable(environment) {
  const candidates = [];
  if (environment.DOTNET_ROOT) {
    candidates.push(resolve(environment.DOTNET_ROOT, "dotnet"));
  }
  candidates.push(resolve(homedir(), ".dotnet", "dotnet"));
  for (const directory of (environment.PATH || "").split(delimiter)) {
    if (directory) candidates.push(resolve(directory, "dotnet"));
  }
  return candidates.find(existsSync) || null;
}

export function prepareDevYarnCompiler({ environment, projectRoot }) {
  if (environment.YARN_COMPILER_PATH) {
    return { path: environment.YARN_COMPILER_PATH, configured: true };
  }
  const dotnet = dotnetExecutable(environment);
  if (!dotnet) {
    console.warn(
      "[dev:all] .NET was not found; Yarn authoring and scripted events are disabled.",
    );
    return { path: null, configured: false };
  }

  const compilerProject = resolve(
    projectRoot,
    "tools/yarn-compiler/NewYokosuka.YarnCompiler.csproj",
  );
  const compilerPath = resolve(
    projectRoot,
    "tools/yarn-compiler/bin/Release/net9.0/NewYokosuka.YarnCompiler",
  );
  const resolvedDotnet = realpathSync(dotnet);
  environment.DOTNET_ROOT ||= dirname(resolvedDotnet);
  environment.DOTNET_ROLL_FORWARD ||= "Major";
  const built = spawnSync(
    resolvedDotnet,
    ["build", compilerProject, "--configuration", "Release", "--nologo"],
    { cwd: projectRoot, env: environment, stdio: "inherit" },
  );
  if (built.status !== 0 || !existsSync(compilerPath)) {
    throw new Error("the official Yarn compiler could not be built");
  }
  environment.YARN_COMPILER_PATH = compilerPath;
  console.log(`[dev:all] Yarn:   ${compilerPath}`);
  return { path: compilerPath, configured: true };
}
