"use client"

import { useEffect } from "react"
import { updatePlayerPresence } from "@/lib/players"

interface PresenceOptions {
  pingIntervalMs?: number
}

type PresenceStatus = "online" | "offline" | "away"

const MIN_INTERVAL_MS = 2000

export function usePresence(userId?: string, options?: PresenceOptions) {
  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return
    }

    let active = true
    const intervalMs = Math.max(options?.pingIntervalMs ?? 5000, MIN_INTERVAL_MS)

    updatePlayerPresence(userId, "online")

    const timerId = window.setInterval(() => {
      if (!active) return
      updatePlayerPresence(userId, "online")
    }, intervalMs)

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        updatePlayerPresence(userId, "away")
      } else {
        updatePlayerPresence(userId, "online")
      }
    }

    const handleBeforeUnload = () => {
      updatePlayerPresence(userId, "offline")
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      active = false
      window.clearInterval(timerId)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      updatePlayerPresence(userId, "offline")
    }
  }, [options?.pingIntervalMs, userId])
}
