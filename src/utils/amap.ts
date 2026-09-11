import { useConf } from '@/composables/conf'

export interface AmapError {
  status: string
  info: string
  infocode: string
  count?: string
}

export interface AmapGeocode {
  status: string
  info: string
  infocode: string
  count: string
  geocodes: Array<{
    formatted_address: string
    country: string
    province: string
    citycode: string
    city: string
    district: string
    township: Array<any>
    neighborhood: {
      name: Array<any>
      type: Array<any>
    }
    building: {
      name: Array<any>
      type: Array<any>
    }
    adcode: string
    street: Array<any>
    number: Array<any>
    location: string
    level: string
  }>
}
export interface AmapDistance {
  status: string
  info: string
  infocode: string
  count: string
  results?: Array<{
    origin_id: string
    dest_id: string
    distance: string
    duration: string
  }>
}

export interface AmapTransit {
  status: string
  info: string
  infocode: string
  count: string
  route?: {
    transits?: Array<{
      duration: string
    }>
  }
}

export interface AmapRouteResult {
  ok: boolean
  distance: number
  duration: number
  reason?: string
}

interface AmapRegeocode {
  status: string
  info: string
  infocode: string
  regeocode?: {
    addressComponent?: {
      province?: string | Array<unknown>
      city?: string | Array<unknown>
      citycode?: string | Array<unknown>
    }
  }
}

const amapErrorMessages: Record<string, string> = {
  '10001': 'Key 不正确或已过期',
  '10002': '服务不可用或接口路径错误，不需要另开公交权限',
  '10003': '超过当日调用配额',
  '10004': '访问过于频繁',
  '10009': 'Key 与绑定平台不匹配，请确认使用 Web 服务 Key',
  '10012': '账号或 Key 权限不足，高德没有单独的公交权限开关',
}

let originCityCache:
  | {
      origins: string
      key: string
      city: string
    }
  | undefined

function createAmapUrl(path: string, params: Record<string, string>) {
  const url = new URL(`https://restapi.amap.com${path}`)
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
  return url.toString()
}

async function requestAmap<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
    )
  }
  return (await response.json()) as T
}

function formatAmapError(action: string, response: AmapError) {
  const code = response.infocode || '未知错误码'
  const explanation = amapErrorMessages[code]
  return `${action}失败：${response.info || '未知错误'}（错误码 ${code}${explanation ? `，${explanation}` : ''}）`
}

function failedRoute(reason: string): AmapRouteResult {
  return { ok: false, distance: 0, duration: 0, reason }
}

function firstText(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (Array.isArray(value)) {
    const item = value.find((entry) => typeof entry === 'string' && entry.trim())
    return typeof item === 'string' ? item.trim() : undefined
  }
}

export async function amapGeocode(
  address: string,
): Promise<AmapGeocode['geocodes'][number] | undefined> {
  const { formData } = useConf()
  let response: AmapGeocode | AmapError
  try {
    response = await requestAmap<AmapGeocode | AmapError>(
      createAmapUrl('/v3/geocode/geo', {
        address,
        output: 'JSON',
        key: formData.amap.key,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`高德地理编码请求失败：${message}`)
  }
  if (response.status !== '1' || !('geocodes' in response)) {
    throw new Error(formatAmapError('高德地理编码', response))
  }
  const geocode = response.geocodes?.[0]
  if (!geocode) {
    throw new Error(`高德地理编码未找到该地址（结果数 ${response.count || '0'}）`)
  }
  return geocode
}

async function fetchDistance(
  origins: string,
  destination: string,
  type: number,
  key: string,
): Promise<AmapDistance | AmapError> {
  return requestAmap(
    createAmapUrl('/v3/distance', {
      origins,
      destination,
      type: String(type),
      output: 'JSON',
      key,
    }),
  )
}

async function fetchTransit(
  origins: string,
  destination: string,
  city: string,
  cityd: string,
  key: string,
): Promise<AmapTransit | AmapError> {
  return requestAmap(
    createAmapUrl('/v3/direction/transit/integrated', {
      origin: origins,
      destination,
      city,
      cityd,
      strategy: '0',
      nightflag: '0',
      extensions: 'base',
      output: 'JSON',
      key,
    }),
  )
}

function extractDistanceResult(res: AmapDistance | AmapError, name: string): AmapRouteResult {
  if (res.status !== '1') {
    return failedRoute(formatAmapError(`高德${name}距离查询`, res))
  }
  const result = 'results' in res ? res.results?.[0] : undefined
  const distance = Number(result?.distance)
  const duration = Number(result?.duration)
  if (!result || !Number.isFinite(distance)) {
    return failedRoute(`高德${name}距离查询未返回有效结果（结果数 ${res.count || '0'}）`)
  }
  return {
    ok: true,
    distance,
    duration: Number.isFinite(duration) ? duration : 0,
  }
}

async function getDistanceResult(
  origins: string,
  destination: string,
  type: number,
  key: string,
  name: string,
) {
  try {
    return extractDistanceResult(await fetchDistance(origins, destination, type, key), name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failedRoute(`高德${name}距离请求失败：${message}`)
  }
}

async function resolveOriginCity(origins: string, key: string) {
  if (originCityCache?.origins === origins && originCityCache.key === key) {
    return originCityCache.city
  }

  let response: AmapRegeocode | AmapError
  try {
    response = await requestAmap<AmapRegeocode | AmapError>(
      createAmapUrl('/v3/geocode/regeo', {
        location: origins,
        extensions: 'base',
        output: 'JSON',
        key,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`高德起点城市解析请求失败：${message}`)
  }
  if (response.status !== '1' || !('regeocode' in response)) {
    throw new Error(formatAmapError('高德起点城市解析', response))
  }

  const component = response.regeocode?.addressComponent
  const city =
    firstText(component?.citycode) || firstText(component?.city) || firstText(component?.province)
  if (!city) {
    throw new Error('高德起点城市解析失败：返回结果中没有城市信息')
  }
  originCityCache = { origins, key, city }
  return city
}

function extractTransitResult(res: AmapTransit | AmapError): AmapRouteResult {
  if (res.status !== '1') {
    return failedRoute(formatAmapError('高德公共交通路径规划', res))
  }
  const durations = ('route' in res ? (res.route?.transits ?? []) : [])
    .map((transit) => Number(transit.duration))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (durations.length > 0) {
    return {
      ok: true,
      distance: 0,
      duration: Math.min(...durations),
    }
  }
  if (res.count === '0' || !('route' in res)) {
    return failedRoute('高德公共交通路径规划未找到可用路线')
  }
  return failedRoute(
    `高德公共交通路径规划返回 ${res.count || '未知数量'} 条路线，但没有有效通勤时长`,
  )
}

async function getTransitResult(
  origins: string,
  destination: string,
  destinationCity: string | undefined,
  key: string,
) {
  if (!destinationCity) {
    return failedRoute('高德公共交通路径规划未请求：未获取到岗位所在城市')
  }
  try {
    const originCity = await resolveOriginCity(origins, key)
    return extractTransitResult(
      await fetchTransit(origins, destination, originCity, destinationCity, key),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failedRoute(`高德公共交通路径规划请求失败：${message}`)
  }
}

const disabledRoute: AmapRouteResult = { ok: false, distance: 0, duration: 0 }

export async function amapDistance(destination: string, destinationCity?: string) {
  const { formData } = useConf()
  const {
    origins,
    key,
    straightDistance,
    drivingDistance,
    drivingDuration,
    walkingDistance,
    walkingDuration,
    transitDuration,
  } = formData.amap

  const [straight, driving, walking, transit] = await Promise.all([
    straightDistance > 0
      ? getDistanceResult(origins, destination, 0, key, '直线')
      : Promise.resolve(disabledRoute),
    drivingDistance > 0 || drivingDuration > 0
      ? getDistanceResult(origins, destination, 1, key, '驾车')
      : Promise.resolve(disabledRoute),
    walkingDistance > 0 || walkingDuration > 0
      ? getDistanceResult(origins, destination, 3, key, '步行')
      : Promise.resolve(disabledRoute),
    transitDuration > 0
      ? getTransitResult(origins, destination, destinationCity, key)
      : Promise.resolve(disabledRoute),
  ])

  return { straight, driving, walking, transit }
}
