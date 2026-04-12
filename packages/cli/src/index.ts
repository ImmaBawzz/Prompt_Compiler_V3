#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compilePromptBundle, createExportPlan, BrandProfile, PromptBrief } from '@prompt-compiler/core';

type ArgValue = string | boolean;

interface CliArgs {
  briefPath: string;
  profilePath: string;
  includeGenericOutput: boolean;
  exportBundle: boolean;
  outputPath?: string;
  showHelp: boolean;
}

interface CliError {
  code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'SERVER_ERROR';
  message: string;
}

interface CliResponse {
  ok: boolean;
  result?: unknown;
  error?: CliError;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8')) as T;
}

function parseArgs(argv = process.argv.slice(2)): Record<string, ArgValue> {
  const aliases = new Map<string, string>([
    ['b', 'brief'],
    ['p', 'profile'],
    ['o', 'output'],
    ['h', 'help']
  ]);

  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const rawKey = token.slice(2);
    const key = aliases.get(rawKey) ?? rawKey;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function toCliArgs(parsed: Record<string, ArgValue>): CliArgs {
  return {
    briefPath: String(parsed.brief || 'examples/brief.cinematic-afterglow.json'),
    profilePath: String(parsed.profile || 'examples/profile.ljv-signal-core.json'),
    includeGenericOutput: Boolean(parsed['include-generic']),
    exportBundle: Boolean(parsed.export),
    outputPath: parsed.output ? String(parsed.output) : undefined,
    showHelp: Boolean(parsed.help)
  };
}

function printHelp(): void {
  console.error(
    [
      'Prompt Compiler CLI',
      '',
      'Usage:',
      '  prompt-compiler --brief <path> --profile <path> [--include-generic] [--export] [--output <path>]',
      '',
      'Options:',
      '  --brief, --b            Path to brief JSON file.',
      '  --profile, --p          Path to profile JSON file.',
      '  --include-generic       Include generic output target.',
      '  --export                Write export bundle files into workspace.',
      '  --output, --o           Write command JSON response to file.',
      '  --help, --h             Show this help text.'
    ].join('\n')
  );
}

function writeExportPlan(files: { path: string; content: string }[]): void {
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }
}

function writeResponse(response: CliResponse, outputPath?: string): void {
  const payload = JSON.stringify(response, null, 2);
  if (outputPath) {
    const resolvedPath = path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${payload}\n`, 'utf8');
  }
  console.log(payload);
}

function main(): number {
  const args = toCliArgs(parseArgs());

  if (args.showHelp) {
    printHelp();
    return 0;
  }

  try {
    const brief = readJson<PromptBrief>(args.briefPath);
    const profile = readJson<BrandProfile>(args.profilePath);
    const result = compilePromptBundle(brief, profile, {
      includeGenericOutput: args.includeGenericOutput
    });

    const hasErrors = result.diagnostics.some((item) => item.level === 'error');
    if (hasErrors) {
      writeResponse(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Compilation produced validation errors.'
          }
        },
        args.outputPath
      );
      return 2;
    }

    if (args.exportBundle) {
      writeExportPlan(createExportPlan(brief, profile, result));
      console.error('Export completed.');
    }

    writeResponse({ ok: true, result }, args.outputPath);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeResponse(
      {
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message
        }
      },
      args.outputPath
    );
    return 1;
  }
}

process.exitCode = main();
