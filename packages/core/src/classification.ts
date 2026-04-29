import type { Domain, Repository } from './schemas.js';

interface DomainSignal {
  domain: Domain;
  score: number;
  matched: string[];
}

const LANGUAGE_HINTS: Record<string, Partial<Record<Domain, number>>> = {
  TypeScript: { frontend: 1.0, backend: 0.6 },
  JavaScript: { frontend: 0.9, backend: 0.5 },
  CSS: { frontend: 1.5 },
  HTML: { frontend: 1.2 },
  Vue: { frontend: 1.5 },
  Svelte: { frontend: 1.5 },
  Python: { backend: 0.8, ml: 0.9 },
  Jupyter: { ml: 1.5 },
  'Jupyter Notebook': { ml: 1.5 },
  Go: { backend: 1.4, devops: 0.6 },
  Rust: { backend: 1.2, devops: 0.4 },
  Java: { backend: 1.2, mobile: 0.7 },
  Kotlin: { mobile: 1.4, backend: 0.5 },
  Swift: { mobile: 1.5 },
  'Objective-C': { mobile: 1.4 },
  Dart: { mobile: 1.4 },
  Shell: { devops: 1.2 },
  Dockerfile: { devops: 1.5 },
  HCL: { devops: 1.5 },
  Terraform: { devops: 1.5 },
  Ruby: { backend: 1.0 },
  PHP: { backend: 1.0 },
  'C#': { backend: 1.0, mobile: 0.5 },
  C: { backend: 0.6 },
  'C++': { backend: 0.6 },
};

const TOPIC_HINTS: Record<string, Partial<Record<Domain, number>>> = {
  api: { backend: 1.2 },
  rest: { backend: 1.0 },
  graphql: { backend: 1.0 },
  microservice: { backend: 1.2 },
  django: { backend: 1.5 },
  fastapi: { backend: 1.5 },
  rails: { backend: 1.5 },
  express: { backend: 1.3 },
  nestjs: { backend: 1.4 },
  react: { frontend: 1.5 },
  vue: { frontend: 1.5 },
  nextjs: { frontend: 1.5, backend: 0.5 },
  'next.js': { frontend: 1.5, backend: 0.5 },
  tailwind: { frontend: 1.0 },
  'design-system': { frontend: 1.4 },
  ui: { frontend: 0.8 },
  ux: { frontend: 0.8 },
  kubernetes: { devops: 1.5 },
  k8s: { devops: 1.5 },
  docker: { devops: 1.3 },
  terraform: { devops: 1.5 },
  ansible: { devops: 1.4 },
  'ci-cd': { devops: 1.4 },
  helm: { devops: 1.3 },
  observability: { devops: 1.2 },
  'machine-learning': { ml: 1.5 },
  ml: { ml: 1.4 },
  'deep-learning': { ml: 1.5 },
  pytorch: { ml: 1.5 },
  tensorflow: { ml: 1.5 },
  llm: { ml: 1.5 },
  nlp: { ml: 1.4 },
  'computer-vision': { ml: 1.4 },
  android: { mobile: 1.5 },
  ios: { mobile: 1.5 },
  flutter: { mobile: 1.5 },
  'react-native': { mobile: 1.5 },
};

export interface ClassificationResult {
  domain: Domain;
  reasons: string[];
}

export function classifyRepository(repo: Repository): ClassificationResult {
  const domainTotals: Record<Domain, number> = {
    backend: 0,
    frontend: 0,
    devops: 0,
    ml: 0,
    mobile: 0,
    unknown: 0,
  };
  const reasons: string[] = [];

  const totalBytes = repo.languages.reduce((acc, l) => acc + l.bytes, 0) || 1;
  for (const lang of repo.languages) {
    const hints = LANGUAGE_HINTS[lang.name];
    if (!hints) continue;
    const share = lang.bytes / totalBytes;
    for (const [domain, weight] of Object.entries(hints)) {
      domainTotals[domain as Domain] += (weight ?? 0) * share;
    }
  }

  for (const topic of repo.topics) {
    const hints = TOPIC_HINTS[topic.toLowerCase()];
    if (!hints) continue;
    for (const [domain, weight] of Object.entries(hints)) {
      domainTotals[domain as Domain] += weight ?? 0;
    }
    reasons.push(`topic:${topic}`);
  }

  const ranked: DomainSignal[] = (Object.entries(domainTotals) as [Domain, number][])
    .filter(([d]) => d !== 'unknown')
    .map(([domain, score]) => ({ domain, score, matched: [] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score <= 0.3) {
    return { domain: 'unknown', reasons: ['insufficient-signal'] };
  }
  if (repo.primaryLanguage) reasons.unshift(`primary:${repo.primaryLanguage}`);
  reasons.push(`score:${top.score.toFixed(2)}`);
  return { domain: top.domain, reasons };
}
