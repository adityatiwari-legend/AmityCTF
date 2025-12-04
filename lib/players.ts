import { doc, serverTimestamp, setDoc } from "firebase/firestore"

import { db } from "./firebase"

type PresenceStatus = "online" | "offline" | "away"

const USERS_COLLECTION = "users"
const PLAYERS_COLLECTION = "players"

const basePlayerPayload = (data: Record<string, unknown>) => ({
  updatedAt: serverTimestamp(),
  ...data,
})

export async function syncPlayerProfile(userId: string, profile: { name?: string | null; email?: string | null }) {
  if (!userId) return

  try {
    const playerRef = doc(db, PLAYERS_COLLECTION, userId)
    await setDoc(
      playerRef,
      basePlayerPayload({
        name: profile.name ?? null,
        displayName: profile.name ?? null,
        email: profile.email ?? null,
        createdAt: serverTimestamp(),
      }),
      { merge: true },
    )
  } catch (error) {
    console.error("Failed to sync player profile", error)
  }
}

export async function updatePlayerPresence(userId: string, status: PresenceStatus) {
  if (!userId) return

  const payload = {
    status,
    lastActiveAt: serverTimestamp(),
  }

  try {
    await Promise.all([
      setDoc(doc(db, USERS_COLLECTION, userId), payload, { merge: true }),
      setDoc(doc(db, PLAYERS_COLLECTION, userId), basePlayerPayload(payload), { merge: true }),
    ])
  } catch (error) {
    console.error("Failed to update player presence", error)
  }
}

interface PlayerStatsPayload extends Record<string, unknown> {
  completedChallengesCount?: number
  completedQuestionsCount?: number
  lastFlagAt?: ReturnType<typeof serverTimestamp>
}

export async function updatePlayerStats(userId: string, stats: PlayerStatsPayload) {
  if (!userId) return

  try {
    const playerRef = doc(db, PLAYERS_COLLECTION, userId)
    await setDoc(playerRef, basePlayerPayload(stats), { merge: true })
  } catch (error) {
    console.error("Failed to update player stats", error)
  }
}
