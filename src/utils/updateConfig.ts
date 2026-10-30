const DEFAULT_GITHUB_REPO = 'shahidpitafiskp-ui/Skp-vpn';

function resolveConfiguredRepo(): string {
  const raw = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim();
  if (raw && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    return raw;
  }
  return DEFAULT_GITHUB_REPO;
}

export const GITHUB_REPO = resolveConfiguredRepo();

export function getRepoUrls(repoSlug: string = GITHUB_REPO) {
  const cleanRepo =
    repoSlug && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoSlug.trim())
      ? repoSlug.trim()
      : GITHUB_REPO;

  return {
    repo: cleanRepo,
    repoApi: `https://api.github.com/repos/${cleanRepo}`,
    otaCommitApi: `https://api.github.com/repos/${cleanRepo}/commits/ota-live`,
    latestReleaseApi: `https://api.github.com/repos/${cleanRepo}/releases/latest`,
    releasesListApi: `https://api.github.com/repos/${cleanRepo}/releases?per_page=5`,
    directApkUrl: `https://github.com/${cleanRepo}/releases/latest/download/app-debug.apk`,
    repoSettingsUrl: `https://github.com/${cleanRepo}/settings`,
    otaManifestMirrors: (commitSha?: string) => {
      const ref = commitSha && commitSha.length >= 7 ? commitSha : 'ota-live';
      const ts = Date.now();
      return [
        `https://raw.githubusercontent.com/${cleanRepo}/${ref}/ota-manifest.json?t=${ts}`,
        `https://cdn.jsdelivr.net/gh/${cleanRepo}@${ref}/ota-manifest.json?t=${ts}`,
        `https://github.com/${cleanRepo}/releases/latest/download/ota-manifest.json?t=${ts}`,
      ];
    },
  };
}
