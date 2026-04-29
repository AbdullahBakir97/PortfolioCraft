import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { PortfolioConfig } from './schemas.js';

export async function loadConfigFile(path: string | undefined): Promise<PortfolioConfig> {
  if (!path) return PortfolioConfig.parse({});
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = parseYaml(raw);
    return PortfolioConfig.parse(parsed ?? {});
  } catch (err) {
    if (isFsNotFound(err)) return PortfolioConfig.parse({});
    throw err;
  }
}

export function mergeConfigWithInputs(
  fileConfig: PortfolioConfig,
  inputs: { sections: string; locale: PortfolioConfig['locale'] },
): PortfolioConfig {
  const sectionsFromInput = inputs.sections
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return PortfolioConfig.parse({
    ...fileConfig,
    sections: sectionsFromInput.length > 0 ? sectionsFromInput : fileConfig.sections,
    locale: inputs.locale,
  });
}

function isFsNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
