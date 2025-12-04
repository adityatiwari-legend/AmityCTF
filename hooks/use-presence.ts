"use client"

import { useEffect } from "react"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"

import { db } from "@/lib/firebase"

interface PresenceOptions {
  pingIntervalMs?: number
}

type PresenceStatus = "online" | "offline" | "away"

const MIN_INTERVAL_MS = 2000

const updatePresence = async (userId: string, status: PresenceStatus) => {
  try {
    const userRef = doc(db, "users", userId)
    await setDoc(
      userRef,
      {
        status,
        lastActiveAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error) {
    console.error("Failed to update presence", error)
  }
}

export function usePresence(userId?: string, options?: PresenceOptions) {
  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return
    }

    let active = true
    const intervalMs = Math.max(options?.pingIntervalMs ?? 5000, MIN_INTERVAL_MS)

    updatePresence(userId, "online")

    const timerId = window.setInterval(() => {
      if (!active) return
      updatePresence(userId, "online")
    }, intervalMs)

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        updatePresence(userId, "away")
      } else {
        updatePresence(userId, "online")
      }
    }

    const handleBeforeUnload = () => {
      updatePresence(userId, "offline")
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      active = false
      window.clearInterval(timerId)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      updatePresence(userId, "offline")
    }
  }, [options?.pingIntervalMs, userId])
}
