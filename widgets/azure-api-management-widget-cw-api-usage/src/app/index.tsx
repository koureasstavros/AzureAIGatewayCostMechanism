import {useCallback, useEffect, useMemo, useState} from "react"
import {useDeveloperPortalRequest, useExternalRequest, useRequest, useSecrets, useValues} from "../hooks"

type SubscriptionProperties = {
  displayName?: string
  name?: string
  primaryKey?: string
  secondaryKey?: string
  state?: string
  scope?: string
}

type SubscriptionEntity = {
  id: string
  name: string
  ownerId?: string
  primaryKey?: string
  secondaryKey?: string
  displayName?: string
  state?: string
  scope?: string
  properties?: SubscriptionProperties
}

type SubscriptionSecrets = {
  primaryKey?: string
  secondaryKey?: string
}

type ProductProperties = {
  displayName?: string
  title?: string
}

type ProductEntity = {
  id: string
  name: string
  properties?: ProductProperties
}

type UsageStats = {
  consumed: number
  quota: number
  remaining: number
  pct: number
}

type UsageItem = {
  subscriptionName: string
  subscriptionId: string
  productName?: string
  state?: string
  subscriptionScope?: string
  debug?: string[]
  stats?: UsageStats
  error?: string
}

type GroupEntity = {
  id: string
  name?: string
  properties?: {
    displayName?: string
    builtIn?: boolean
    type?: string
  }
}

type GroupUserEntity = {
  id: string
  name?: string
  properties?: {
    firstName?: string
    lastName?: string
    email?: string
  }
}

type UserEntity = {
  id: string
  name?: string
  properties?: {
    firstName?: string
    lastName?: string
    email?: string
  }
}

type AggregateStatsItem = {
  userName?: string
  subscriptionName: string
  subscriptionId: string
  productName?: string
  state?: string
  consumed?: number
  quota?: number
  remaining?: number
  pct?: number
  debug?: string[]
  error?: string
}

type TabKey = "mine" | "all"

type SortableColumn = "userName" | "productName" | "subscriptionName" | "state" | "consumed" | "quota" | "remaining" | "pct"

type SortDirection = "asc" | "desc"

type StatisticUpdateType = "cost" | "quota"

type StatisticEditValues = {
  cost: string
  quota: string
}

type UpdateMessage = {
  kind: "success" | "error"
  text: string
}

type AggregateSummary = {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
}

type ExternalRequest = ReturnType<typeof useExternalRequest>

const STATISTICS_MAX_CONCURRENCY = 4
const STATISTICS_MAX_ATTEMPTS = 3
const STATISTICS_TIMEOUT_MS = 15000

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

function createConcurrencyLimiter(maxConcurrency: number) {
  let activeCount = 0
  const queue: Array<() => void> = []

  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (activeCount >= maxConcurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }

    activeCount += 1
    try {
      return await operation()
    } finally {
      activeCount -= 1
      queue.shift()?.()
    }
  }
}

function isRetryableStatisticsStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function getRetryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, 0), 10000)
    }

    const retryDate = Date.parse(retryAfter)
    if (Number.isFinite(retryDate)) {
      return Math.min(Math.max(retryDate - Date.now(), 0), 10000)
    }
  }

  return 500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250)
}

function validateUsageStats(value: unknown): UsageStats {
  if (!value || typeof value !== "object") {
    throw new Error("Statistics response was not a JSON object")
  }

  const stats = value as Partial<UsageStats>
  const fields: Array<keyof UsageStats> = ["consumed", "quota", "remaining", "pct"]
  for (const field of fields) {
    if (typeof stats[field] !== "number" || !Number.isFinite(stats[field])) {
      throw new Error(`Statistics response has an invalid ${field} value`)
    }
  }

  return stats as UsageStats
}

async function requestStatistics(
  externalRequest: ExternalRequest,
  url: string,
  subscriptionKeyHeader: string,
  subscriptionKey: string,
  debug: string[],
): Promise<UsageStats> {
  let lastError: unknown

  for (let attempt = 1; attempt <= STATISTICS_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), STATISTICS_TIMEOUT_MS)
    let response: Response | undefined

    try {
      response = await externalRequest(url, {
        [subscriptionKeyHeader]: subscriptionKey,
      }, {
        signal: controller.signal,
      })
      debug.push(`statisticsAttempt${attempt}Status=${response.status}`)

      if (response.ok) {
        const body: unknown = await response.json()
        return validateUsageStats(body)
      }

      let responseDetails = ""
      if (attempt === STATISTICS_MAX_ATTEMPTS || !isRetryableStatisticsStatus(response.status)) {
        responseDetails = (await response.text()).trim().slice(0, 300)
      }
      lastError = new Error(`Statistics request failed (${response.status})${responseDetails ? `: ${responseDetails}` : ""}`)

      if (!isRetryableStatisticsStatus(response.status)) {
        throw lastError
      }
    } catch (error) {
      lastError = controller.signal.aborted
        ? new Error(`Statistics request timed out after ${STATISTICS_TIMEOUT_MS / 1000} seconds`)
        : error
      debug.push(`statisticsAttempt${attempt}Error=${formatError(lastError)}`)

      if (error instanceof Error && error.message.startsWith("Statistics request failed") && response && !isRetryableStatisticsStatus(response.status)) {
        throw error
      }
    } finally {
      window.clearTimeout(timeoutId)
    }

    if (attempt < STATISTICS_MAX_ATTEMPTS) {
      const retryDelay = getRetryDelay(response, attempt)
      debug.push(`statisticsAttempt${attempt}RetryDelayMs=${retryDelay}`)
      await delay(retryDelay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Statistics request failed after retries")
}

function prettifyName(value: string): string {
  return value
    .split(/[\-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getScopeSegment(scope: string | undefined): string | undefined {
  if (!scope) return undefined
  const parts = scope.split("/").filter(Boolean)
  return parts[parts.length - 1]
}

function getProductResourcePath(scope: string | undefined): string | undefined {
  const normalized = normalizeManagementPath(scope ?? "")
  if (!normalized || !isProductScope(normalized)) return undefined

  const marker = "/products/"
  const productIndex = normalized.toLowerCase().indexOf(marker)
  if (productIndex === -1) return undefined

  return normalized.slice(productIndex)
}

function normalizeManagementPath(path: string): string {
  if (!path) return path
  const withoutQuery = path.split("?")[0] ?? path
  if (withoutQuery.startsWith("http://") || withoutQuery.startsWith("https://")) {
    try {
      return new URL(withoutQuery).pathname
    } catch {
      return withoutQuery
    }
  }

  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`
}

function isProductScope(scope: string | undefined): boolean {
  return Boolean(scope && /\/products\//i.test(scope))
}

function formatError(err: unknown): string {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Failed to fetch. Check the statistics URL, CORS policy, HTTPS certificate, and whether the API is reachable from the browser."
  }

  return err instanceof Error ? err.message : String(err)
}

function barClassName(pct: number): string {
  if (pct >= 90) return "usage-bar-fill high"
  if (pct >= 70) return "usage-bar-fill warn"
  return "usage-bar-fill"
}

function getSubscriptionKey(sub: SubscriptionEntity): string | undefined {
  return sub.primaryKey
    ?? sub.secondaryKey
    ?? sub.properties?.primaryKey
    ?? sub.properties?.secondaryKey
}

async function getSubscriptionKeyForAdminView(sub: SubscriptionEntity, request: ReturnType<typeof useRequest>): Promise<string | undefined> {
  const existingKey = getSubscriptionKey(sub)
  if (existingKey) return existingKey

  const secretsRes = await request(`/subscriptions/${sub.name}/listSecrets`, "POST")
  if (!secretsRes.ok) {
    throw new Error(`Could not load subscription secrets (${secretsRes.status})`)
  }

  const secrets: SubscriptionSecrets = await secretsRes.json()
  return secrets.primaryKey ?? secrets.secondaryKey
}

function getSubscriptionScope(sub: SubscriptionEntity): string | undefined {
  return sub.scope ?? sub.properties?.scope
}

function getSubscriptionState(sub: SubscriptionEntity): string | undefined {
  return sub.state ?? sub.properties?.state
}

function getSubscriptionDisplayName(sub: SubscriptionEntity): string | undefined {
  return sub.displayName ?? sub.properties?.displayName ?? sub.properties?.name
}

function getUserResourceName(value: string | undefined): string {
  if (!value) return ""
  const parts = value.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? value
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function getGroupName(group: GroupEntity): string | undefined {
  return group.properties?.displayName ?? group.name
}

function isCurrentUserInGroup(users: GroupUserEntity[], currentUserId: string): boolean {
  const expected = normalizeText(currentUserId)
  if (!expected) return false

  return users.some(user => {
    const nameMatch = normalizeText(user.name) === expected
    const idParts = user.id.split("/").filter(Boolean)
    const idSegment = idParts[idParts.length - 1]
    const idMatch = normalizeText(idSegment) === expected
    return nameMatch || idMatch
  })
}

function formatNumber(value: number | undefined, fractionDigits = 0): string {
  return (value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

function formatOptionalNumber(value: number | undefined, fractionDigits = 0, suffix = ""): string {
  return value === undefined ? "Unavailable" : `${formatNumber(value, fractionDigits)}${suffix}`
}

function formatCurrency(value: number | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

function getGroupUserDisplayName(user: GroupUserEntity): string {
  const firstName = user.properties?.firstName?.trim()
  const lastName = user.properties?.lastName?.trim()
  const fullName = [firstName, lastName].filter(Boolean).join(" ")

  return fullName || user.properties?.email || user.name || user.id
}

function getUserDisplayName(user: UserEntity): string {
  const firstName = user.properties?.firstName?.trim()
  const lastName = user.properties?.lastName?.trim()
  const fullName = [firstName, lastName].filter(Boolean).join(" ")

  return fullName || user.properties?.email || user.name || user.id
}

function getUserLookupKeys(user: UserEntity): string[] {
  const keys = new Set<string>()
  const resourceName = getUserResourceName(user.name ?? user.id)
  const fullId = normalizeText(user.id)
  const shortName = normalizeText(user.name)
  const email = normalizeText(user.properties?.email)

  if (resourceName) keys.add(normalizeText(resourceName))
  if (fullId) keys.add(fullId)
  if (shortName) keys.add(shortName)
  if (email) keys.add(email)

  return Array.from(keys)
}

function getSubscriptionOwnerUserId(sub: SubscriptionEntity): string | undefined {
  return getUserResourceName(sub.ownerId)
}

function getSubscriptionOwnerLookupKeys(sub: SubscriptionEntity): string[] {
  const keys = new Set<string>()
  const ownerId = sub.ownerId
  const ownerResourceName = getSubscriptionOwnerUserId(sub)
  const normalizedOwnerId = normalizeText(ownerId)
  const normalizedOwnerResourceName = normalizeText(ownerResourceName)

  if (normalizedOwnerId) keys.add(normalizedOwnerId)
  if (normalizedOwnerResourceName) keys.add(normalizedOwnerResourceName)

  if (ownerId) {
    ownerId
      .split("/")
      .filter(Boolean)
      .map(part => normalizeText(part))
      .filter(Boolean)
      .forEach(part => keys.add(part))
  }

  return Array.from(keys)
}

function getAggregateItemKey(item: AggregateStatsItem): string {
  return `${item.subscriptionId}::${normalizeText(item.userName)}`
}

function dedupeAggregateItems(items: AggregateStatsItem[]): AggregateStatsItem[] {
  const itemsByKey = new Map<string, AggregateStatsItem>()

  items.forEach(item => {
    const key = getAggregateItemKey(item)
    const existing = itemsByKey.get(key)

    if (!existing) {
      itemsByKey.set(key, item)
      return
    }

    const existingHasMetrics = existing.consumed !== undefined || existing.quota !== undefined || existing.remaining !== undefined || existing.pct !== undefined
    const itemHasMetrics = item.consumed !== undefined || item.quota !== undefined || item.remaining !== undefined || item.pct !== undefined

    if (!existingHasMetrics && itemHasMetrics) {
      itemsByKey.set(key, item)
      return
    }

    if (existing.error && !item.error) {
      itemsByKey.set(key, item)
    }
  })

  return Array.from(itemsByKey.values())
}

async function getPagedCollection<T>(request: ReturnType<typeof useRequest>, path: string): Promise<T[]> {
  const items: T[] = []
  let nextPath: string | undefined = path

  while (nextPath) {
    const response = await request(nextPath)
    if (!response.ok) {
      throw new Error(`Could not load collection (${response.status})`)
    }

    const body = await response.json() as {value?: T[]; nextLink?: string}
    items.push(...(body.value ?? []))

    if (!body.nextLink) {
      nextPath = undefined
      continue
    }

    try {
      const nextUrl = new URL(body.nextLink)
      nextPath = `${nextUrl.pathname}${nextUrl.search}`
    } catch {
      nextPath = body.nextLink
    }
  }

  return items
}

async function getInitialAndPagedCollection<T>(
  initialResponse: Response,
  request: (url: string, method?: string) => Promise<Response>,
): Promise<T[]> {
  if (!initialResponse.ok) {
    throw new Error(`Could not load collection (${initialResponse.status})`)
  }

  const firstPage = await initialResponse.json() as {value?: T[]; nextLink?: string}
  const items = firstPage.value ?? []

  if (!firstPage.nextLink) {
    return items
  }

  try {
    const nextUrl = new URL(firstPage.nextLink)
    const remainingItems = await getPagedCollection<T>(request as ReturnType<typeof useRequest>, `${nextUrl.pathname}${nextUrl.search}`)
    return [...items, ...remainingItems]
  } catch {
    const remainingItems = await getPagedCollection<T>(request as ReturnType<typeof useRequest>, firstPage.nextLink)
    return [...items, ...remainingItems]
  }
}

function summarizeUsageStats(items: AggregateStatsItem[]): AggregateSummary {
  return items.reduce<AggregateSummary>((summary, item) => ({
    totalCost: summary.totalCost + (item.consumed ?? 0),
    totalInputTokens: summary.totalInputTokens + (item.quota ?? 0),
    totalOutputTokens: summary.totalOutputTokens + (item.remaining ?? 0),
    totalTokens: summary.totalTokens + (item.pct ?? 0),
  }), {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
  })
}

function compareNullableStrings(a: string | undefined, b: string | undefined): number {
  return (a ?? "").localeCompare(b ?? "", undefined, {sensitivity: "base"})
}

function compareNullableNumbers(a: number | undefined, b: number | undefined): number {
  return (a ?? 0) - (b ?? 0)
}

async function resolveProductName(
  productResourcePath: string | undefined,
  productNameByScope: Map<string, string>,
  request: ReturnType<typeof useRequest>,
): Promise<string | undefined> {
  if (!productResourcePath) return undefined

  const cachedProductName = productNameByScope.get(productResourcePath)
  if (cachedProductName) return cachedProductName

  try {
    const productRes = await request(productResourcePath)
    if (!productRes.ok) return undefined

    const product: ProductEntity = await productRes.json()
    const productName = product.properties?.displayName ?? product.properties?.title ?? product.name

    if (productName) {
      productNameByScope.set(productResourcePath, productName)
    }

    return productName
  } catch {
    return undefined
  }
}

const App = () => {
  const values = useValues()
  const {userId} = useSecrets()
  const request = useRequest()
  const developerPortalRequest = useDeveloperPortalRequest()
  const externalRequest = useExternalRequest()

  const [items, setItems] = useState<UsageItem[] | undefined>()
  const [allItems, setAllItems] = useState<AggregateStatsItem[] | undefined>()
  const [loadError, setLoadError] = useState<string | undefined>()
  const [allLoadError, setAllLoadError] = useState<string | undefined>()
  const [isContributorUser, setIsContributorUser] = useState(false)
  const [contributorDebug, setContributorDebug] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>("mine")
  const [sortColumn, setSortColumn] = useState<SortableColumn>("userName")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [refreshToken, setRefreshToken] = useState(0)
  const [isMineLoading, setIsMineLoading] = useState(true)
  const [isAllLoading, setIsAllLoading] = useState(true)
  const [currentUserStatisticsKey, setCurrentUserStatisticsKey] = useState<string | undefined>()
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | undefined>()
  const [statisticEditValues, setStatisticEditValues] = useState<StatisticEditValues>({cost: "", quota: ""})
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | undefined>()
  const [updateMessage, setUpdateMessage] = useState<UpdateMessage | undefined>()

  const refresh = useCallback(() => {
    setItems(undefined)
    setAllItems(undefined)
    setLoadError(undefined)
    setAllLoadError(undefined)
    setIsMineLoading(true)
    setIsAllLoading(true)
    setCurrentUserStatisticsKey(undefined)
    setRefreshToken(value => value + 1)
  }, [])

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    const limitStatisticsConcurrency = createConcurrencyLimiter(STATISTICS_MAX_CONCURRENCY)

    async function load() {
      try {
        const groupsRes = await request("/groups")
        const groupsBody = groupsRes.ok ? await groupsRes.json() : {value: []}
        const groups: GroupEntity[] = groupsBody.value ?? []
        const contributorGroup = groups.find(group => normalizeText(getGroupName(group)) === normalizeText(values.contributorGroupName))

        let contributorUser = false
        let groupUsersStatus = 0
        let groupUsers: GroupUserEntity[] = []

        if (contributorGroup?.name) {
          const groupUsersRes = await request(`/groups/${contributorGroup.name}/users`, "GET")
          groupUsersStatus = groupUsersRes.status
          if (groupUsersRes.ok) {
            groupUsers = await getInitialAndPagedCollection<GroupUserEntity>(groupUsersRes, request)
          }

          contributorUser = isCurrentUserInGroup(groupUsers, userId ?? "")
        }

        if (!cancelled) {
          setIsContributorUser(contributorUser)
          setContributorDebug([
            `userId=${userId}`,
            `expectedContributorGroup=${values.contributorGroupName}`,
            `groupsStatus=${groupsRes.status}`,
            `groupsReturned=${groups.map(group => `${getGroupName(group) ?? group.id} (${group.name ?? "no-name"})`).join(", ") || "none"}`,
            `matchedGroupId=${contributorGroup?.name ?? "none"}`,
            `groupUsersStatus=${groupUsersStatus || "not-called"}`,
            `groupUsersReturned=${groupUsers.map(user => user.name ?? user.id).join(", ") || "none"}`,
            `isContributorUser=${contributorUser ? "yes" : "no"}`,
          ])
          setActiveTab(current => (current === "all" && !contributorUser ? "mine" : current))
        }

        // 1. List this user's subscriptions.
        const subsRes = await developerPortalRequest(`/developer/users/${userId}/subscriptions?$top=50&$skip=0&api-version=2022-04-01-preview`)
        const subs = await getInitialAndPagedCollection<SubscriptionEntity>(subsRes, developerPortalRequest)

        const productNameByScope = new Map<string, string>()

        await Promise.all(
          Array.from(new Set(
            subs
              .map(sub => normalizeManagementPath(getSubscriptionScope(sub) ?? ""))
              .filter((scope): scope is string => Boolean(scope) && isProductScope(scope)),
          ))
            .map(async scope => {
              try {
                const productRes = await request(scope)
                if (!productRes.ok) return

                const product: ProductEntity = await productRes.json()
                const productName = product.properties?.displayName ?? product.properties?.title ?? product.name
                if (productName) {
                  productNameByScope.set(scope, productName)
                }
              } catch {
                // Ignore product lookup failures and fall back to subscription id.
              }
            }),
        )

        // 2. For each subscription, use the key from the subscriptions payload,
        //    then call your /statistics API with that key.
        const usageItemPromises =
          subs.map(sub => limitStatisticsConcurrency(async (): Promise<UsageItem> => {
            const normalizedScope = normalizeManagementPath(getSubscriptionScope(sub) ?? "")
            const productName = normalizedScope ? productNameByScope.get(normalizedScope) : undefined
            const scopeName = getScopeSegment(normalizedScope)
            const subscriptionName = getSubscriptionDisplayName(sub)
              ?? sub.name
            const debug: string[] = []

            try {
              debug.push(`subscriptionId=${sub.name}`)
              debug.push(`subscriptionState=${getSubscriptionState(sub) ?? "unknown"}`)
              debug.push(`statisticsApiUrl=${values.statisticsApiUrl}`)
              debug.push(`subscriptionKeyHeader=${values.subscriptionKeyHeader}`)

              const key = getSubscriptionKey(sub)
              if (!key) throw new Error("No subscription key available")
              debug.push(`subscriptionKeyFound=${key ? "yes" : "no"}`)

              const stats = await requestStatistics(
                externalRequest,
                values.statisticsApiUrl,
                values.subscriptionKeyHeader,
                key,
                debug,
              )
              if (!cancelled) {
                setCurrentUserStatisticsKey(currentKey => currentKey ?? key)
              }
              debug.push(`statisticsResponse=${JSON.stringify(stats)}`)

              return {
                subscriptionName,
                subscriptionId: sub.name,
                productName,
                state: getSubscriptionState(sub),
                subscriptionScope: normalizedScope,
                stats,
                debug,
              }
            } catch (err) {
              debug.push(`error=${formatError(err)}`)

              return {
                subscriptionName,
                subscriptionId: sub.name,
                productName,
                state: getSubscriptionState(sub),
                subscriptionScope: normalizedScope,
                debug,
                error: formatError(err),
              }
            }
          }))

        if (!cancelled) setItems([])
        usageItemPromises.forEach(promise => {
          void promise.then(item => {
            if (!cancelled) {
              setItems(currentItems => [...(currentItems ?? []), item])
            }
          })
        })
        await Promise.all(usageItemPromises)
        if (!cancelled) setIsMineLoading(false)

        if (contributorGroup?.name) {
          try {
            const usersRes = await request("/users")
            const allUsers = usersRes.ok
              ? await getInitialAndPagedCollection<UserEntity>(usersRes, request)
              : []
            const allSubscriptionsRes = await request("/subscriptions")
            const allSubscriptions = allSubscriptionsRes.ok
              ? await getInitialAndPagedCollection<SubscriptionEntity>(allSubscriptionsRes, request)
              : []
            const userNameById = new Map<string, string>()
            allUsers.forEach(user => {
              const displayName = getUserDisplayName(user)
              getUserLookupKeys(user).forEach(key => {
                if (key) {
                  userNameById.set(key, displayName)
                }
              })
            })

            const subscriptionUserNameById = new Map<string, string>()
            await Promise.all(
              allUsers.map(async user => {
                const displayName = getUserDisplayName(user)
                const userResourceName = getUserResourceName(user.name ?? user.id)
                if (!userResourceName) return

                try {
                  const userSubscriptionsRes = await request(`/users/${userResourceName}/subscriptions`)
                  if (!userSubscriptionsRes.ok) return

                  const userSubscriptions = await getInitialAndPagedCollection<SubscriptionEntity>(userSubscriptionsRes, request)
                  userSubscriptions.forEach(subscription => {
                    if (subscription.name && !subscriptionUserNameById.has(subscription.name)) {
                      subscriptionUserNameById.set(subscription.name, displayName)
                    }
                  })
                } catch {
                  // Ignore fallback lookup failures.
                }
              }),
            )

            const aggregateResultPromises =
              allSubscriptions.map(sub => limitStatisticsConcurrency(async (): Promise<AggregateStatsItem> => {
                const normalizedScope = normalizeManagementPath(getSubscriptionScope(sub) ?? "")
                const productResourcePath = getProductResourcePath(normalizedScope)
                const productName = await resolveProductName(productResourcePath, productNameByScope, request)

                const ownerUserId = getSubscriptionOwnerUserId(sub)
                const ownerLookupKeys = getSubscriptionOwnerLookupKeys(sub)
                const matchedOwnerLookupKey = ownerLookupKeys.find(key => userNameById.has(key))
                const resolvedUserName = matchedOwnerLookupKey ? userNameById.get(matchedOwnerLookupKey) : undefined
                const fallbackUserName = subscriptionUserNameById.get(sub.name)
                const userName = resolvedUserName ?? fallbackUserName

                const subscriptionName = getSubscriptionDisplayName(sub) ?? sub.name
                const debug: string[] = [
                  `groupUser=${ownerUserId || "unassigned"}`,
                  `groupUserDisplayName=${userName || "none"}`,
                  `ownerLookupKeys=${ownerLookupKeys.join(",") || "none"}`,
                  `matchedOwnerLookupKey=${matchedOwnerLookupKey || "none"}`,
                  `fallbackUserName=${fallbackUserName || "none"}`,
                  `subscriptionId=${sub.name}`,
                  `subscriptionScope=${normalizedScope || "none"}`,
                  `productResourcePath=${productResourcePath || "none"}`,
                  `productName=${productName || "none"}`,
                  `subscriptionOwnerId=${sub.ownerId || "none"}`,
                  `statisticsApiUrl=${values.statisticsApiUrl}`,
                  `subscriptionKeyHeader=${values.subscriptionKeyHeader}`,
                ]

                try {
                  const key = await getSubscriptionKeyForAdminView(sub, request)
                  if (!key) throw new Error("No subscription key available")
                  debug.push("subscriptionKeyFound=yes")

                  const stats = await requestStatistics(
                    externalRequest,
                    values.statisticsApiUrl,
                    values.subscriptionKeyHeader,
                    key,
                    debug,
                  )
                  debug.push(`statisticsResponse=${JSON.stringify(stats)}`)

                  return {
                    userName,
                    subscriptionName,
                    subscriptionId: sub.name,
                    productName,
                    state: getSubscriptionState(sub),
                    consumed: stats.consumed,
                    quota: stats.quota,
                    remaining: stats.remaining,
                    pct: stats.pct,
                    debug,
                  }
                } catch (err) {
                  debug.push(`error=${formatError(err)}`)

                  return {
                    userName,
                    subscriptionName,
                    subscriptionId: sub.name,
                    productName,
                    state: getSubscriptionState(sub),
                    debug,
                    error: formatError(err),
                  }
                }
              }))

            if (!cancelled) {
              setAllItems([])
            }
            aggregateResultPromises.forEach(promise => {
              void promise.then(item => {
                if (!cancelled) {
                  setAllItems(currentItems => dedupeAggregateItems([...(currentItems ?? []), item]))
                }
              })
            })
            await Promise.all(aggregateResultPromises)
            if (!cancelled) setIsAllLoading(false)
          } catch (err) {
            if (!cancelled) {
              setAllLoadError(formatError(err))
              setIsAllLoading(false)
            }
          }
        } else if (!cancelled) {
          setAllItems(undefined)
          setAllLoadError(undefined)
          setIsAllLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
          setIsMineLoading(false)
          setIsAllLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, request, developerPortalRequest, externalRequest, values.statisticsApiUrl, values.subscriptionKeyHeader, values.contributorGroupName, refreshToken])

  const aggregateSummary = useMemo<AggregateSummary | undefined>(() => {
    const validItems = allItems?.filter(item => !item.error && item.consumed !== undefined)
    if (!validItems?.length) return undefined

    return summarizeUsageStats(validItems)
  }, [allItems])

  const averageUsagePct = useMemo<number | undefined>(() => {
    const percentages = allItems
      ?.map(item => item.pct)
      .filter((value): value is number => value !== undefined)
    if (!percentages?.length) return undefined

    return percentages.reduce((sum, value) => sum + value, 0) / percentages.length
  }, [allItems])

  const sortedUsageItems = useMemo(() => {
    if (!items) return undefined

    return [...items].sort((left, right) => {
      const leftPct = left.stats?.pct ?? -1
      const rightPct = right.stats?.pct ?? -1
      return rightPct - leftPct
    })
  }, [items])

  const sortedAllItems = useMemo(() => {
    if (!allItems) return undefined

    const sortedItems = [...allItems]
    sortedItems.sort((left, right) => {
      const comparison = (() => {
        switch (sortColumn) {
          case "userName":
            return compareNullableStrings(left.userName, right.userName)
          case "productName":
            return compareNullableStrings(left.productName, right.productName)
          case "subscriptionName":
            return compareNullableStrings(left.subscriptionName, right.subscriptionName)
          case "state":
            return compareNullableStrings(left.state, right.state)
          case "consumed":
            return compareNullableNumbers(left.consumed, right.consumed)
          case "quota":
            return compareNullableNumbers(left.quota, right.quota)
          case "remaining":
            return compareNullableNumbers(left.remaining, right.remaining)
          case "pct":
            return compareNullableNumbers(left.pct, right.pct)
          default:
            return 0
        }
      })()

      return sortDirection === "asc" ? comparison : -comparison
    })

    return sortedItems
  }, [allItems, sortColumn, sortDirection])

  const toggleSort = useCallback((column: SortableColumn) => {
    setSortColumn(currentColumn => {
      if (currentColumn === column) {
        setSortDirection(currentDirection => currentDirection === "asc" ? "desc" : "asc")
        return currentColumn
      }

      setSortDirection("asc")
      return column
    })
  }, [])

  const getSortIndicator = useCallback((column: SortableColumn) => {
    if (sortColumn !== column) return "↕"
    return sortDirection === "asc" ? "↑" : "↓"
  }, [sortColumn, sortDirection])

  const startEditingStatistics = useCallback((item: AggregateStatsItem) => {
    setEditingSubscriptionId(item.subscriptionId)
    setStatisticEditValues({
      cost: item.consumed?.toString() ?? "",
      quota: item.quota?.toString() ?? "",
    })
    setUpdateMessage(undefined)
  }, [])

  const cancelEditingStatistics = useCallback(() => {
    setEditingSubscriptionId(undefined)
    setStatisticEditValues({cost: "", quota: ""})
  }, [])

  const saveStatistics = useCallback(async (item: AggregateStatsItem) => {
    const updates: Array<{type: StatisticUpdateType; value: string}> = []
    const fields: Array<{type: StatisticUpdateType; value: string; currentValue: number | undefined}> = [
      {type: "cost", value: statisticEditValues.cost.trim(), currentValue: item.consumed},
      {type: "quota", value: statisticEditValues.quota.trim(), currentValue: item.quota},
    ]

    for (const field of fields) {
      if (!field.value) continue

      const numericValue = Number(field.value)
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        setUpdateMessage({kind: "error", text: `${field.type === "cost" ? "Cost" : "Quota"} must be a non-negative number.`})
        return
      }

      if (field.currentValue === undefined || numericValue !== field.currentValue) {
        updates.push({type: field.type, value: field.value})
      }
    }

    if (updates.length === 0) {
      setUpdateMessage({kind: "error", text: "Change the cost or quota before saving."})
      return
    }

    setUpdatingSubscriptionId(item.subscriptionId)
    setUpdateMessage(undefined)

    try {
      if (!currentUserStatisticsKey) {
        throw new Error("No statistics subscription key is available for the logged-in user.")
      }

      for (const update of updates) {
        const response = await externalRequest(values.statisticsApiUrl, {
          [values.subscriptionKeyHeader]: currentUserStatisticsKey,
          "Content-Type": "application/json",
        }, {
          method: "POST",
          body: JSON.stringify({
            subscriptionId: item.subscriptionId,
            type: update.type,
            value: update.value,
          }),
        })

        if (!response.ok) {
          const responseText = await response.text()
          throw new Error(`Statistics update failed (${response.status})${responseText ? `: ${responseText}` : ""}`)
        }
      }

      setEditingSubscriptionId(undefined)
      setStatisticEditValues({cost: "", quota: ""})
      setUpdateMessage({kind: "success", text: "Statistics updated successfully."})
      refresh()
    } catch (err) {
      setUpdateMessage({kind: "error", text: formatError(err)})
    } finally {
      setUpdatingSubscriptionId(undefined)
    }
  }, [currentUserStatisticsKey, externalRequest, refresh, statisticEditValues, values.statisticsApiUrl, values.subscriptionKeyHeader])

  const mineContent = (() => {
    if (loadError) {
      return <div className="usage-error">Could not load your usage: {loadError}</div>
    }

    if (!sortedUsageItems || (sortedUsageItems.length === 0 && isMineLoading)) {
      return <div className="usage-loading">Loading your usage…</div>
    }

    if (sortedUsageItems.length === 0) {
      return <div className="usage-loading">No active subscriptions found.</div>
    }

    return (
      <>
        {isMineLoading ? <div className="usage-loading usage-loading-more">Loading more subscriptions…</div> : null}
        {sortedUsageItems.map(item => (
          <div className="usage-card" key={item.subscriptionId}>
            <div className="usage-card-header">
              <h4>{item.subscriptionName}</h4>
              {item.state && item.state !== "active" ? <span className="usage-badge">{item.state}</span> : null}
            </div>
            {item.productName ? <div className="usage-subtitle">Product Name: {item.productName}</div> : null}
            {item.error || !item.stats ? (
              <>
                <div className="usage-error">Could not load usage: {item.error}</div>
                {item.debug?.length ? (
                  <details className="usage-debug">
                    <summary>Debug details</summary>
                    <ul>
                      {item.debug.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <>
                <div className="usage-bar-track">
                  <div
                    className={barClassName(item.stats.pct)}
                    style={{width: `${Math.min(item.stats.pct, 100)}%`}}
                  />
                </div>
                <div className="usage-meta">
                  <span>{item.stats.consumed.toFixed(2)} / {item.stats.quota} used</span>
                  <span>{item.stats.remaining.toFixed(2)} remaining ({item.stats.pct.toFixed(1)}%)</span>
                </div>
                {item.debug?.length ? (
                  <details className="usage-debug">
                    <summary>Debug details</summary>
                    <ul>
                      {item.debug.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
          </div>
        ))}
      </>
    )
  })()

  const allContent = (() => {
    if (!isContributorUser) {
      return null
    }

    if (allLoadError) {
      return <div className="usage-error">Could not load all statistics: {allLoadError}</div>
    }

    if (!sortedAllItems || (sortedAllItems.length === 0 && isAllLoading)) {
      return <div className="usage-loading">Loading all statistics…</div>
    }

    if (sortedAllItems.length === 0) {
      return <div className="usage-loading">No aggregate statistics found.</div>
    }

    return (
      <div className="usage-all-stats">
        {isAllLoading ? <div className="usage-loading">Loading more subscription statistics…</div> : null}
        {updateMessage ? (
          <div className={updateMessage.kind === "error" ? "usage-error" : "usage-success"} role="status">
            {updateMessage.text}
          </div>
        ) : null}
        {aggregateSummary ? (
          <div className="usage-summary-grid">
            <div className="usage-summary-card">
              <span className="usage-summary-label">Total consumed</span>
              <strong>{formatNumber(aggregateSummary.totalCost, 2)}</strong>
            </div>
            <div className="usage-summary-card">
              <span className="usage-summary-label">Total quota</span>
              <strong>{formatNumber(aggregateSummary.totalInputTokens, 2)}</strong>
            </div>
            <div className="usage-summary-card">
              <span className="usage-summary-label">Total remaining</span>
              <strong>{formatNumber(aggregateSummary.totalOutputTokens, 2)}</strong>
            </div>
            <div className="usage-summary-card">
              <span className="usage-summary-label">Average usage %</span>
              <strong>{formatOptionalNumber(averageUsagePct, 1, "%")}</strong>
            </div>
          </div>
        ) : null}
        <div className="usage-table-wrapper">
          <table className="usage-table">
            <thead>
              <tr>
                <th><button className="usage-sort-button" onClick={() => toggleSort("userName")} type="button">User Name {getSortIndicator("userName")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("productName")} type="button">Product Name {getSortIndicator("productName")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("subscriptionName")} type="button">Subscription Name {getSortIndicator("subscriptionName")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("state")} type="button">State {getSortIndicator("state")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("consumed")} type="button">Consumed {getSortIndicator("consumed")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("quota")} type="button">Quota {getSortIndicator("quota")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("remaining")} type="button">Remaining {getSortIndicator("remaining")}</button></th>
                <th><button className="usage-sort-button" onClick={() => toggleSort("pct")} type="button">Usage {getSortIndicator("pct")}</button></th>
                <th>Actions</th>
                <th>Debug</th>
              </tr>
            </thead>
            <tbody>
              {sortedAllItems.map((item, index) => (
                <tr key={`${item.subscriptionId}-${index}`}>
                  <td>{item.userName ?? "-"}</td>
                  <td>{item.productName ?? "-"}</td>
                  <td>{item.subscriptionName}</td>
                  <td>{item.state ?? "-"}</td>
                  <td>
                    {editingSubscriptionId === item.subscriptionId ? (
                      <input
                        aria-label={`Consumed cost for ${item.subscriptionName}`}
                        className="usage-edit-input"
                        min="0"
                        onChange={event => setStatisticEditValues(current => ({...current, cost: event.target.value}))}
                        step="0.01"
                        type="number"
                        value={statisticEditValues.cost}
                      />
                    ) : formatOptionalNumber(item.consumed, 2)}
                  </td>
                  <td>
                    {editingSubscriptionId === item.subscriptionId ? (
                      <input
                        aria-label={`Quota for ${item.subscriptionName}`}
                        className="usage-edit-input"
                        min="0"
                        onChange={event => setStatisticEditValues(current => ({...current, quota: event.target.value}))}
                        step="0.01"
                        type="number"
                        value={statisticEditValues.quota}
                      />
                    ) : formatOptionalNumber(item.quota, 2)}
                  </td>
                  <td>{formatOptionalNumber(item.remaining, 2)}</td>
                  <td>{formatOptionalNumber(item.pct, 1, "%")}</td>
                  <td>
                    <div className="usage-row-actions">
                      {editingSubscriptionId === item.subscriptionId ? (
                        <>
                          <button
                            className="usage-row-button usage-row-button-primary"
                            disabled={updatingSubscriptionId === item.subscriptionId}
                            onClick={() => void saveStatistics(item)}
                            type="button"
                          >
                            {updatingSubscriptionId === item.subscriptionId ? "Saving…" : "Save"}
                          </button>
                          <button
                            className="usage-row-button"
                            disabled={updatingSubscriptionId === item.subscriptionId}
                            onClick={cancelEditingStatistics}
                            type="button"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="usage-row-button"
                          disabled={Boolean(updatingSubscriptionId) || Boolean(item.error)}
                          onClick={() => startEditingStatistics(item)}
                          type="button"
                          title={item.error ? "Refresh the statistics before editing this row" : undefined}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {item.error || item.debug?.length ? (
                      <details className="usage-debug usage-debug-inline">
                        <summary>{item.error ? "Show error" : "Show debug"}</summary>
                        {item.error ? <div className="usage-error">{item.error}</div> : null}
                        {item.debug?.length ? (
                          <div className="usage-debug-lines">
                            {item.debug.map(line => <div key={line}>{line}</div>)}
                          </div>
                        ) : null}
                      </details>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  })()

  return (
    <div className="usage-widget-root">
      <div className="usage-widget-header">
        <div>
          <h3 className="usage-widget-title">API usage</h3>
          <div className="usage-widget-caption">
            {activeTab === "mine"
              ? "Your current subscription usage and quota status."
              : "Aggregate statistics for all users, products, and subscriptions."}
          </div>
        </div>
        <div className="usage-widget-actions">
          {isContributorUser ? (
            <div className="usage-tabs" role="tablist" aria-label="Usage views">
              <button
                className={`usage-tab ${activeTab === "mine" ? "active" : ""}`}
                onClick={() => setActiveTab("mine")}
                type="button"
              >
                My usage
              </button>
              <button
                className={`usage-tab ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
                type="button"
              >
                All statistics
              </button>
            </div>
          ) : null}
          <button className="usage-refresh-button" onClick={refresh} type="button">Refresh</button>
        </div>
      </div>
      {contributorDebug.length ? (
        <details className="usage-debug usage-debug-block">
          <summary>Contributor tab debug</summary>
          <ul>
            {contributorDebug.map(line => <li key={line}>{line}</li>)}
          </ul>
        </details>
      ) : null}
      {activeTab === "all" && isContributorUser ? allContent : mineContent}
    </div>
  )
}

export default App
