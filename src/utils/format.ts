export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatCount(count: number, suffix: string): string {
  if (count >= 1000000) {
    const millions = count / 1000000
    const formatted = millions % 1 === 0
      ? `${Math.floor(millions)}M`
      : `${millions.toFixed(1)}M`
    return `${formatted} ${suffix}`
  }
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ' + suffix
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }
  return `${minutes} min`
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function getImageUrl(images?: Array<{ url: string }> | null): string {
  return images?.[0]?.url || images?.[1]?.url || ''
}
