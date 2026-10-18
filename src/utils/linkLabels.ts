const SITES: [host: string, name: string][] = [
  ['acropassport.com', 'AcroPassport'],
  ['acrodemy.eu', 'Acrodemy'],
  ['christiangieger.de', 'Christian Gieger'],
  ['jacobbrownacro.com', 'Jacob Brown'],
  ['partneracrobatics.com', 'Partner Acrobatics'],
  ['acroadventure.com', 'AcroAdventure'],
  ['acroyogavideos.com', 'AcroYogaVideos'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['instagram.com', 'Instagram'],
  ['reddit.com', 'Reddit'],
];

export function siteName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return SITES.find(([site]) => host === site || host.endsWith(`.${site}`))?.[1] ?? host;
}

export const linkLabel = (url: string) => `Open on ${siteName(url)}`;
