"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { collection, deleteDoc, doc, onSnapshot, query, Timestamp } from "firebase/firestore"
import {
  Activity,
  AlertCircle,
  Clock3,
  Crown,
  Flag,
  Loader2,
  LogOut,
  RefreshCcw,
  Shield,
  UserCheck,
  Users,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getChallenges, type Challenge } from "@/lib/challenges"
import { db } from "@/lib/firebase"

const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "admin@accxctf.com"
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "FlagMaster!2025"
const SESSION_KEY = "adminnhimilega:auth"
const ONLINE_WINDOW_MS = 5000
const RECENT_WINDOW_MS = 60000

type PresenceState = "online" | "recent" | "offline"

interface PlayerRecord {
  id: string
  name: string
  email: string
  completedChallenges: number
  completedQuestions: number
  score: number
  lastActiveAt: Date | null
  lastFlagAt: Date | null
  presence: PresenceState
}

const timestampToDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === "function") {
      try {
        return maybe.toDate()
      } catch (error) {
        console.warn("Unable to convert Firestore timestamp", error)
        return null
      }
    }
  }
  return null
}

const derivePresence = (rawStatus: string | undefined, lastActiveAt: Date | null): PresenceState => {
  if (!lastActiveAt) {
    return rawStatus === "online" ? "online" : "offline"
  }
  const diff = Date.now() - lastActiveAt.getTime()
  if (rawStatus === "offline") return "offline"
  if (diff <= ONLINE_WINDOW_MS) return "online"
  if (diff <= RECENT_WINDOW_MS) return "recent"
  return "offline"
}

const formatRelativeTime = (date: Date | null): string => {
  if (!date) return "No activity yet"
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 5000) return "Just now"
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  return `${diffHr}h ago`
}

const presenceBadgeClass = (presence: PresenceState) => {
  switch (presence) {
    case "online":
      return "bg-emerald-100 text-emerald-800"
    case "recent":
      return "bg-amber-100 text-amber-800"
    default:
      return "bg-slate-200 text-slate-700"
  }
}

const presenceLabel = (presence: PresenceState) => {
  switch (presence) {
    case "online":
      return "Online"
    case "recent":
      return "Idle"
    default:
      return "Offline"
  }
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function AdminPortalPage() {
  const [formValues, setFormValues] = useState({ username: "", password: "" })
  const [loginError, setLoginError] = useState("")
  const [loginBusy, setLoginBusy] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  const [challengeData, setChallengeData] = useState<Challenge[]>([])
  const [challengeError, setChallengeError] = useState("")
  const [challengeLoading, setChallengeLoading] = useState(false)
  const [leaderboardData, setLeaderboardData] = useState<PlayerRecord[]>([])
  const [leaderboardError, setLeaderboardError] = useState("")
  const [leaderboardReady, setLeaderboardReady] = useState(false)
  const [lastLeaderboardUpdate, setLastLeaderboardUpdate] = useState<Date | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    setIsAuthenticated(stored === "granted")
    setSessionReady(true)
  }, [])

  const fetchChallenges = useCallback(async () => {
    setChallengeError("")
    setChallengeLoading(true)
    try {
      const data = await getChallenges()
      setChallengeData(data)
    } catch (error) {
      console.error("Failed to load challenges for admin dashboard", error)
      setChallengeError("Unable to reach Firestore right now. Try refreshing in a moment.")
    } finally {
      setChallengeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchChallenges()
  }, [fetchChallenges, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    setLeaderboardError("")
    const usersRef = collection(db, "players")
    const leaderboardQuery = query(usersRef)

    const unsubscribe = onSnapshot(
      leaderboardQuery,
      (snapshot) => {
        const records = snapshot.docs.map<PlayerRecord>((docSnapshot) => {
          const data = docSnapshot.data()
          const completedChallenges =
            typeof data.completedChallengesCount === "number"
              ? data.completedChallengesCount
              : Array.isArray(data.completedChallenges)
                ? data.completedChallenges.length
                : 0
          const completedQuestions =
            typeof data.completedQuestionsCount === "number"
              ? data.completedQuestionsCount
              : Array.isArray(data.completedQuestions)
                ? data.completedQuestions.length
                : 0
          const lastActiveAt = timestampToDate(data.lastActiveAt)
          const lastFlagAt = timestampToDate(data.lastFlagAt)
          const rawStatus = typeof data.status === "string" ? data.status : undefined
          const presence = derivePresence(rawStatus, lastActiveAt)

          return {
            id: docSnapshot.id,
            name:
              typeof data.name === "string" && data.name.trim().length
                ? data.name.trim()
                : "Unnamed player",
            email: typeof data.email === "string" ? data.email : "Not provided",
            completedChallenges,
            completedQuestions,
            score: completedQuestions,
            lastActiveAt,
            lastFlagAt,
            presence,
          }
        })

        records.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (b.completedChallenges !== a.completedChallenges) {
            return b.completedChallenges - a.completedChallenges
          }
          const aTime = a.lastActiveAt?.getTime() ?? 0
          const bTime = b.lastActiveAt?.getTime() ?? 0
          return bTime - aTime
        })

        setLeaderboardData(records)
        setLeaderboardReady(true)
        setLastLeaderboardUpdate(new Date())
      },
      (error) => {
        console.error("Failed to stream leaderboard", error)
        setLeaderboardError("Unable to stream leaderboard right now. Please retry shortly.")
      },
    )

    return () => unsubscribe()
  }, [isAuthenticated])

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError("")
    setLoginBusy(true)

    const expectedUsername = ADMIN_USERNAME.trim().toLowerCase()
    const expectedPassword = ADMIN_PASSWORD
    const providedUsername = formValues.username.trim().toLowerCase()
    const providedPassword = formValues.password

    await delay(350)

    if (providedUsername !== expectedUsername || providedPassword !== expectedPassword) {
      setLoginError("Those credentials do not match the admin records.")
      setLoginBusy(false)
      return
    }

    setIsAuthenticated(true)
    setFormValues({ username: "", password: "" })
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KEY, "granted")
    }

    setLoginBusy(false)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setChallengeData([])
    setLeaderboardData([])
    setLeaderboardReady(false)
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_KEY)
    }
  }

  const totalChallenges = challengeData.length
  const totalQuestions = useMemo(
    () => challengeData.reduce((sum, item) => sum + item.questions.length, 0),
    [challengeData],
  )
  const averageQuestions = totalChallenges ? (totalQuestions / totalChallenges).toFixed(1) : "0"

  const busiestChallenge = useMemo(() => {
    if (!challengeData.length) return null
    return challengeData.reduce((prev, curr) => (curr.questions.length > prev.questions.length ? curr : prev))
  }, [challengeData])

  const challengeRows = useMemo(
    () =>
      challengeData.map((item) => ({
        id: item.id,
        label: item.challengeNo || item.id,
        questions: item.questions.length,
        status: item.isActive === false ? "Paused" : "Live",
      })),
    [challengeData],
  )

  const leaderboardTop = useMemo(() => leaderboardData.slice(0, 8), [leaderboardData])
  const presenceBuckets = useMemo(
    () =>
      leaderboardData.reduce(
        (acc, player) => {
          acc[player.presence].push(player)
          return acc
        },
        {
          online: [] as PlayerRecord[],
          recent: [] as PlayerRecord[],
          offline: [] as PlayerRecord[],
        },
      ),
    [leaderboardData],
  )

  const totalPlayers = leaderboardData.length
  const onlineCount = presenceBuckets.online.length
  const recentCount = presenceBuckets.recent.length
  const offlineCount = presenceBuckets.offline.length
  const rosterDirectory = useMemo(
    () => [...leaderboardData].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)),
    [leaderboardData],
  )
  const totalFlagsCaptured = useMemo(
    () => leaderboardData.reduce((sum, player) => sum + player.completedQuestions, 0),
    [leaderboardData],
  )
  const playersWithoutFlags = useMemo(
    () => leaderboardData.filter((player) => player.completedQuestions === 0).length,
    [leaderboardData],
  )
  const playersWithFlags = totalPlayers - playersWithoutFlags
  const averageFlagsPerPlayer = totalPlayers ? (totalFlagsCaptured / totalPlayers).toFixed(1) : "0"
  const recentFlaggers = useMemo(
    () =>
      leaderboardData
        .filter((player) => player.lastFlagAt)
        .sort((a, b) => (b.lastFlagAt?.getTime() ?? 0) - (a.lastFlagAt?.getTime() ?? 0))
        .slice(0, 6),
    [leaderboardData],
  )

  const handleDeletePlayer = useCallback(
    async (player: PlayerRecord) => {
      if (deletingPlayerId) return
      const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete ${player.name}?`)
      if (!confirmed) return
      setDeleteError("")
      setDeletingPlayerId(player.id)
      try {
        await Promise.all([
          deleteDoc(doc(db, "players", player.id)),
          deleteDoc(doc(db, "users", player.id)),
        ])
      } catch (error) {
        console.error("Failed to delete player", error)
        setDeleteError("Deletion failed. Check Firestore permissions and try again.")
      } finally {
        setDeletingPlayerId(null)
      }
    },
    [deletingPlayerId],
  )

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <Loader2 className="size-5 animate-spin" /> Preparing admin portal...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md border-primary/30 shadow-xl">
          <CardHeader className="text-center space-y-2">
            <Shield className="mx-auto size-10 text-primary" />
            <CardTitle className="text-2xl">Admin Access Gate</CardTitle>
            <CardDescription>Enter the private credentials to reach the mission dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="admin-username">Admin email</Label>
                <Input
                  id="admin-username"
                  type="email"
                  autoComplete="username"
                  value={formValues.username}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="admin@accxctf.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={formValues.password}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="••••••••"
                  required
                />
              </div>

              {loginError ? (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="size-4" />
                  {loginError}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={loginBusy}>
                {loginBusy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Verifying
                  </span>
                ) : (
                  "Enter Command Center"
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Default credentials can be customized with NEXT_PUBLIC_ADMIN_USERNAME and NEXT_PUBLIC_ADMIN_PASSWORD.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Admin dashboard</p>
            <h1 className="text-2xl font-bold">Mission Control</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={fetchChallenges} disabled={challengeLoading}>
              {challengeLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              <span className="hidden sm:inline">Refresh data</span>
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Active challenges</CardTitle>
              <Shield className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{totalChallenges}</p>
              <p className="text-sm text-muted-foreground">Synced from Firestore</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Questions live</CardTitle>
              <Flag className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{totalQuestions}</p>
              <p className="text-sm text-muted-foreground">Avg {averageQuestions} per challenge</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Most demanding</CardTitle>
              <Activity className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              {busiestChallenge ? (
                <>
                  <p className="text-xl font-semibold">{busiestChallenge.challengeNo || busiestChallenge.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {busiestChallenge.questions.length} questions awaiting verification
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Add a challenge to see load insights.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Players tracked</CardTitle>
              <Users className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{totalPlayers}</p>
              <p className="text-sm text-muted-foreground">
                {onlineCount} online · {recentCount} idle · {offlineCount} offline
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Crown className="size-4 text-primary" />
                  Mission leaderboard
                </div>
                <CardDescription>Updates in near real-time as flags are captured.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="size-4" />
                {leaderboardReady && lastLeaderboardUpdate
                  ? `Updated ${lastLeaderboardUpdate.toLocaleTimeString()}`
                  : "Connecting to Firestore..."}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {leaderboardError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {leaderboardError}
                </div>
              ) : leaderboardReady && leaderboardTop.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4 font-medium">#</th>
                      <th className="py-2 pr-4 font-medium">Player</th>
                      <th className="py-2 pr-4 font-medium">Flags</th>
                      <th className="py-2 pr-4 font-medium">Cleared</th>
                      <th className="py-2 pr-4 font-medium">Last ping</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardTop.map((player, index) => (
                      <tr key={player.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-semibold">{index + 1}</td>
                        <td className="py-3 pr-4">
                          <p className="font-semibold leading-tight">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.email}</p>
                        </td>
                        <td className="py-3 pr-4 font-semibold">{player.score}</td>
                        <td className="py-3 pr-4">{player.completedChallenges}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{formatRelativeTime(player.lastActiveAt)}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${presenceBadgeClass(
                              player.presence,
                            )}`}
                          >
                            {presenceLabel(player.presence)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  Listening for the next capture. Leaderboard will appear as soon as players submit flags.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UserCheck className="size-4 text-primary" />
                Active commanders
              </div>
              <CardDescription>Live presence view for every registered player.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-semibold">{onlineCount}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Online</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{recentCount}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Idle</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{offlineCount}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Offline</p>
                </div>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {(["online", "recent", "offline"] as const).map((bucket) => (
                  <div key={bucket} className="rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{presenceLabel(bucket)}</span>
                      <span>{presenceBuckets[bucket].length}</span>
                    </div>
                    {presenceBuckets[bucket].length ? (
                      <ul className="mt-2 space-y-2">
                        {presenceBuckets[bucket].map((player) => (
                          <li key={`${bucket}-${player.id}`} className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold leading-tight">{player.name}</p>
                              <p className="text-[11px] text-muted-foreground">{player.email}</p>
                            </div>
                            <div className="text-right text-[11px] text-muted-foreground">
                              <p>{player.score} flags</p>
                              <p>{formatRelativeTime(player.lastActiveAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No players in this state.</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle>Player directory</CardTitle>
              <CardDescription>A live roster of every registered commander.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rosterDirectory.length ? (
                <>
                  <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Player</th>
                        <th className="py-2 pr-4 font-medium">Email</th>
                        <th className="py-2 pr-4 font-medium">Flags</th>
                        <th className="py-2 pr-4 font-medium">Challenges</th>
                        <th className="py-2 pr-4 font-medium">Presence</th>
                        <th className="py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterDirectory.map((player) => (
                        <tr key={`directory-${player.id}`} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{player.name}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{player.email}</td>
                          <td className="py-3 pr-4">{player.score}</td>
                          <td className="py-3 pr-4">{player.completedChallenges}</td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${presenceBadgeClass(
                                player.presence,
                              )}`}
                            >
                              {presenceLabel(player.presence)}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeletePlayer(player)}
                              disabled={deletingPlayerId === player.id}
                              className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" />
                              {deletingPlayerId === player.id ? "Deleting" : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {deleteError ? <p className="mt-3 text-sm text-destructive">{deleteError}</p> : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Waiting for the first player signup.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent flag captures</CardTitle>
              <CardDescription>Most recent solves across every challenge.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentFlaggers.length ? (
                <ul className="space-y-3">
                  {recentFlaggers.map((player) => (
                    <li key={`flag-${player.id}`} className="rounded-xl border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold leading-tight">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.email}</p>
                        </div>
                        <span className="text-xs font-semibold text-primary">{player.score} flags</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last flag {formatRelativeTime(player.lastFlagAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No successful submissions detected yet.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle>Challenge overview</CardTitle>
              <CardDescription>Live data pulled directly from the challenges collection.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {challengeRows.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Challenge</th>
                      <th className="py-2 pr-4 font-medium">Questions</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {challengeRows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{row.label}</td>
                        <td className="py-3 pr-4">{row.questions}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              row.status === "Live"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {challengeLoading ? "Loading data..." : "No challenges found. Seed Firestore to get started."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Aggregated stats across every Active Commander.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border px-4 py-3">
                <p className="font-semibold">Total flags captured</p>
                <p className="text-2xl font-bold">{totalFlagsCaptured}</p>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <p className="font-semibold">Average per player</p>
                <p className="text-2xl font-bold">{averageFlagsPerPlayer}</p>
                <p className="text-xs text-muted-foreground">{playersWithFlags} players have captured at least one flag.</p>
              </div>
              <div className="rounded-xl border px-4 py-3">
                <p className="font-semibold">Still ramping up</p>
                <p className="text-2xl font-bold">{playersWithoutFlags}</p>
                <p className="text-xs text-muted-foreground">Players yet to capture their first flag.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Live system status</CardTitle>
              <CardDescription>Quick signal on the overall health of the CTF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-primary" />
                <div>
                  <p className="font-semibold">Players connected</p>
                  <p className="text-sm text-muted-foreground">Realtime count from Firebase Auth dashboard.</p>
                </div>
                <span className="ml-auto text-lg font-semibold">--</span>
              </div>
              <div className="flex items-center gap-3">
                <Activity className="size-5 text-primary" />
                <div>
                  <p className="font-semibold">Submissions in queue</p>
                  <p className="text-sm text-muted-foreground">Monitor anomalies or brute-force attempts.</p>
                </div>
                <span className="ml-auto text-lg font-semibold">--</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>Action items that need moderator attention.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {challengeError ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 text-destructive" />
                  <div>
                    <p className="font-semibold text-destructive">Data refresh failed</p>
                    <p>{challengeError}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  All systems are green. No pending alerts.
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={fetchChallenges} disabled={challengeLoading}>
                {challengeLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                Re-run checks
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
