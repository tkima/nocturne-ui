export function buildSpotifyUri(type: string, id: string): string {
  return `spotify:${type}:${id}`
}
