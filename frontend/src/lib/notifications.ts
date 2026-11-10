export type AppNotification = {
  id: string
  title: string
  body: string
  at: string
  href?: string
  read?: boolean
}

const KEY = 'medichain_notifications'

export function listNotifications(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as AppNotification[]
  } catch {
    return []
  }
}

export function pushNotification(
  n: Omit<AppNotification, 'id' | 'at' | 'read'>,
): void {
  const row: AppNotification = {
    ...n,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    read: false,
  }
  const next = [row, ...listNotifications()].slice(0, 40)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function markNotificationsRead(): void {
  const next = listNotifications().map((n) => ({ ...n, read: true }))
  localStorage.setItem(KEY, JSON.stringify(next))
}
