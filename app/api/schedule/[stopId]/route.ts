import { NextResponse } from 'next/server'

const fallback = [
  { route: 'Т34', type: 'Автобус', minutes: 3, scheduledAt: '12:25', direction: 'Метро «Тульская»' },
  { route: 'М5', type: 'Автобус', minutes: 8, scheduledAt: '12:30', direction: 'Нагорный бульвар' },
  { route: '26', type: 'Трамвай', minutes: 14, scheduledAt: '12:36', direction: 'Каланчёвская' },
  { route: 'Т18', type: 'Автобус', minutes: 21, scheduledAt: '12:43', direction: 'Метро «Войковская»' },
  { route: 'Н6', type: 'Автобус', minutes: 29, scheduledAt: '12:51', direction: 'Осташковская улица' },
]

function clockAfter(seconds: number) {
  const date = new Date(Date.now() + Math.max(0, seconds) * 1000)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function normalize(payload: any) {
  if (!Array.isArray(payload?.routePath)) return null
  const arrivals = payload.routePath.flatMap((route: any) => {
    const forecasts = Array.isArray(route?.externalForecast) ? route.externalForecast : []
    return forecasts.slice(0, 5).map((forecast: any) => {
      const rawSeconds = Number(forecast?.time ?? forecast?.seconds ?? 0)
      const minutes = Math.max(0, Math.round(rawSeconds / 60))
      const scheduledAt = forecast?.arrivalTime || forecast?.timeArrival || forecast?.date
      return {
        route: String(route?.number ?? '—'),
        type: String(route?.type ?? route?.transportType ?? 'Транспорт'),
        minutes,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : clockAfter(rawSeconds),
        direction: String(route?.name ?? route?.direction ?? route?.destination ?? 'Направление не указано'),
      }
    })
  }).filter((arrival: any) => arrival.route !== '—')
  return arrivals.length ? arrivals.slice(0, 30) : null
}

async function requestTransportApi(stopId: string, signal: AbortSignal) {
  const response = await fetch(`https://moscowtransport.app/api/stop_v2/${encodeURIComponent(stopId)}`, {
    headers: { Accept: 'application/json, text/plain, */*', 'Accept-Language': 'ru,en;q=0.9', 'User-Agent': 'Mozilla/5.0', Referer: 'https://moscowapp.mos.ru/', Origin: 'https://moscowapp.mos.ru' },
    signal, cache: 'no-store',
  })
  if (!response.ok) throw new Error(`transport api: ${response.status}`)
  const payload = await response.json()
  const arrivals = normalize(payload)
  if (!arrivals) throw new Error('empty response')
  return { name: String(payload?.name ?? 'Остановка'), arrivals }
}

export async function GET(_request: Request, { params }: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stopId)) return NextResponse.json({ error: 'Некорректный UUID' }, { status: 400 })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const result = await requestTransportApi(stopId, controller.signal)
    return NextResponse.json({ ...result, fallback: false, fetchedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ name: 'Остановка', fallback: true, error: 'fallback' })
  } finally { clearTimeout(timeout) }
}

export const dynamic = 'force-dynamic'
