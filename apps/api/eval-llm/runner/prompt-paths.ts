const PROMPT_FILE_RE =
  /^(apps\/api\/src\/services\/.*-prompts\.ts|apps\/api\/src\/services\/llm\/.+\.ts|apps\/api\/src\/services\/dictation\/generate\.ts)$/;

const PROMPT_EXCLUDE_RE =
  /(\.test\.ts$|^apps\/api\/src\/services\/llm\/(envelope|project-response|stream-envelope|extract-json)\.ts$)/;

export function isPromptTouchingPath(gitPath: string): boolean {
  const normalized = normalizeGitPath(gitPath);
  return PROMPT_FILE_RE.test(normalized) && !PROMPT_EXCLUDE_RE.test(normalized);
}

function normalizeGitPath(gitPath: string): string {
  return gitPath.replace(/\\/g, '/');
}
