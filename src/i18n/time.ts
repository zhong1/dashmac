export type Lang = 'en' | 'zh-CN'

const STR = {
  en: {
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} hour ago`,
    today: (hm: string) => `Today ${hm}`,
    yesterday: (hm: string) => `Yesterday ${hm}`,
    daysAgo: (n: number) => `${n} days ago`,
  },
  'zh-CN': {
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    today: (hm: string) => `今天 ${hm}`,
    yesterday: (hm: string) => `昨天 ${hm}`,
    daysAgo: (n: number) => `${n} 天前`,
  },
}

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }
function hhmm(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function formatRelativeTime(ms: number, lang: Lang, now: number = Date.now()): string {
  const s = STR[lang]
  const target = new Date(ms)
  const nowDate = new Date(now)
  const deltaMs = now - ms
  const deltaSec = Math.floor(deltaMs / 1000)
  const deltaMin = Math.floor(deltaSec / 60)
  const deltaHr = Math.floor(deltaMin / 60)

  if (deltaSec < 60) return s.justNow
  if (deltaMin < 60) return s.minutesAgo(deltaMin)
  if (deltaHr < 2) return s.hoursAgo(deltaHr)
  if (deltaHr < 24 && isSameDay(target, nowDate)) return s.today(hhmm(target))

  const yesterday = new Date(nowDate)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(target, yesterday)) return s.yesterday(hhmm(target))

  const deltaDay = Math.floor(deltaMs / (24 * 60 * 60 * 1000))
  if (deltaDay < 7) return s.daysAgo(deltaDay)

  return ymd(target)
}
