#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const androidHome = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(process.env.HOME || '', 'Library/Android/sdk');
const port = process.env.RCT_METRO_PORT || process.env.EXPO_METRO_PORT || '8081';

function prependPath(entries, currentPath) {
  return [
    ...entries.filter(Boolean),
    currentPath,
  ].filter(Boolean).join(path.delimiter);
}

const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || androidHome,
  APP_VARIANT: process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_ENV || 'development',
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV || process.env.APP_VARIANT || 'development',
  RCT_METRO_PORT: port,
  PATH: prependPath(
    [
      path.join(androidHome, 'platform-tools'),
      path.join(androidHome, 'emulator'),
    ],
    process.env.PATH,
  ),
};

const metroStatusUrl = `http://127.0.0.1:${port}/status`;

function resolveAndroidTool(name) {
  const candidate = path.join(androidHome, 'platform-tools', name);
  return existsSync(candidate) ? candidate : name;
}

function resolveExpoBin() {
  const localBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
  return existsSync(localBin) ? localBin : process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function expoArgsFor(expoBin, args) {
  return expoBin.endsWith('npx') || expoBin.endsWith('npx.cmd')
    ? ['expo', ...args]
    : args;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isMetroRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(metroStatusUrl, { signal: controller.signal });
    const body = await response.text();
    return body.includes('packager-status:running');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureMetro(expoBin) {
  if (await isMetroRunning()) {
    return false;
  }

  console.log(`[android] Metro is not running on ${metroStatusUrl}; starting it before launching Android.`);
  const child = spawn(
    expoBin,
    expoArgsFor(expoBin, ['start', '--dev-client', '--localhost', '--port', port]),
    {
      cwd: repoRoot,
      detached: true,
      env,
      stdio: 'ignore',
    },
  );
  child.unref();

  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (await isMetroRunning()) {
      console.log(`[android] Metro is ready on port ${port}.`);
      return true;
    }
    await wait(1000);
  }

  console.error(`[android] Metro did not become ready on ${metroStatusUrl}. Run npm start in a separate terminal and retry.`);
  process.exit(1);
}

function runOptional(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    timeout: 20_000,
  });

  if (result.status === 0) {
    return;
  }

  if (result.error?.code === 'ETIMEDOUT') {
    console.warn(`[android] ${label} timed out and was skipped.`);
    return;
  }

  const output = [result.stderr, result.stdout]
    .filter(Boolean)
    .join('\n')
    .trim();
  const detail = output ? ` ${output.split('\n')[0]}` : '';
  console.warn(`[android] ${label} skipped.${detail}`);
}

function runRequired(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[android] Unable to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const adb = resolveAndroidTool(process.platform === 'win32' ? 'adb.exe' : 'adb');

const extraArgs = process.argv.slice(2);
const expoBin = resolveExpoBin();
await ensureMetro(expoBin);
runOptional(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], `adb reverse tcp:${port} tcp:${port}`);

const expoArgs = expoArgsFor(expoBin, ['run:android', '--port', port, '--no-bundler', ...extraArgs]);

runRequired(expoBin, expoArgs);
