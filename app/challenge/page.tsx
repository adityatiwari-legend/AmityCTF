"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"

import {
  getChallengeById,
  getChallenges,
  getUserProgress,
  markChallengeCompleted,
  markQuestionCompleted,
  verifyFlag,
  type Challenge,
} from "@/lib/challenges"
import { auth } from "@/lib/firebase"
import { usePresence } from "@/hooks/use-presence"

export default function ChallengePage() {
  return (
    <Suspense fallback={<ChallengePageFallback />}>
      <ChallengePageContent />
    </Suspense>
  )
}

function ChallengePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const challengeIdFromUrl = searchParams.get("id") || ""

  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([])
  const [activeChallengeId, setActiveChallengeId] = useState<string>("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [userId, setUserId] = useState<string>("")
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([])
  const [completedQuestions, setCompletedQuestions] = useState<string[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [flagDisplay, setFlagDisplay] = useState<string>("--")
  const flagCacheKey = useMemo(() => (userId ? `flag-count:${userId}` : null), [userId])
  usePresence(userId || undefined, { pingIntervalMs: 4000 })


  const currentQuestion = challenge?.questions?.[questionIndex]
  const totalQuestions = challenge?.questions?.length ?? 0
  const formattedFlagCount = useMemo(() => {
    if (flagDisplay !== "--") return flagDisplay
    return completedQuestions.length.toString().padStart(2, "0")
  }, [flagDisplay, completedQuestions.length])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login")
        return
      }
      setUserId(user.uid)
      setAuthReady(true)
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (!userId) {
      setCompletedChallenges([])
      setCompletedQuestions([])
      setFlagDisplay("00")
      return
    }

    if (flagCacheKey && typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(flagCacheKey)
      if (cached) {
        setFlagDisplay(cached)
      } else {
        setFlagDisplay("00")
      }
    }

    async function loadProgress() {
      try {
        const progress = await getUserProgress(userId)
        setCompletedChallenges(progress.completedChallenges)
        setCompletedQuestions(progress.completedQuestions)
      } catch (err) {
        console.error("Error loading user progress:", err)
      }
    }

    loadProgress()
  }, [userId, flagCacheKey])

  useEffect(() => {
    if (!authReady) return

    async function loadChallenges() {
      setLoading(true)
      try {
        const response = await getChallenges()
        setAllChallenges(response)

        if (!response.length) {
          setError("No challenges available. Please add one in Firestore.")
          setActiveChallengeId("")
          return
        }

        const exists = challengeIdFromUrl
          ? response.some((challengeItem) => challengeItem.id === challengeIdFromUrl)
          : false

        const initialId = exists ? challengeIdFromUrl : response[0].id
        setActiveChallengeId(initialId)

        if (!exists) {
          router.replace(`/challenge?id=${initialId}`)
        }
      } catch (err) {
        console.error("Error loading challenges list:", err)
        setError("Failed to load challenges")
      } finally {
        setLoading(false)
      }
    }

    loadChallenges()
  }, [authReady, challengeIdFromUrl, router])

  useEffect(() => {
    async function loadChallenge() {
      if (!activeChallengeId) return
      setLoading(true)
      try {
        const data = await getChallengeById(activeChallengeId)
        if (!data) {
          setError("Challenge not found")
          setChallenge(null)
        } else {
          setError("")
          setChallenge(data)
        }
      } catch (err) {
        console.error("Error loading challenge:", err)
        setError("Failed to load challenge")
        setChallenge(null)
      } finally {
        setLoading(false)
      }
    }

    loadChallenge()
  }, [activeChallengeId])

  useEffect(() => {
    setQuestionIndex(0)
    setCode("")
    setSuccess("")
  }, [challenge?.id])

  const nextChallenge = useMemo(() => {
    if (!allChallenges.length) return null
    const currentIndex = allChallenges.findIndex((item) => item.id === activeChallengeId)
    if (currentIndex === -1) return null
    return allChallenges[currentIndex + 1] ?? null
  }, [activeChallengeId, allChallenges])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    if (!code.trim()) {
      setError("Please enter a flag")
      return
    }

    if (!challenge || !currentQuestion) {
      setError("This challenge has no questions configured.")
      return
    }

    try {
      const isCorrect = await verifyFlag(activeChallengeId, currentQuestion.number, code)
      if (isCorrect) {
        setError("")
        
        // Increment session counter immediately
        const currentCount = parseInt(flagDisplay === "--" ? "0" : flagDisplay, 10)
        const newCount = currentCount + 1
        const newDisplay = newCount.toString().padStart(2, "0")
        setFlagDisplay(newDisplay)
        
        if (flagCacheKey && typeof window !== "undefined") {
          window.sessionStorage.setItem(flagCacheKey, newDisplay)
        }

        // Mark this question as completed in backend (if new)
        const questionId = `${activeChallengeId}-q${currentQuestion.number}`
        if (userId && !completedQuestions.includes(questionId)) {
          try {
            const progress = await markQuestionCompleted(userId, activeChallengeId, currentQuestion.number)
            setCompletedQuestions(progress.completedQuestions)
          } catch (progressError) {
            console.error("Failed to update flag counter:", progressError)
          }
        }
        
        const hasNextQuestion = totalQuestions && questionIndex + 1 < totalQuestions
        if (hasNextQuestion) {
          setSuccess(`🎉 Oh you found a flag! Moving to Question ${questionIndex + 2}.`)
          setCode("")
          setTimeout(() => {
            setQuestionIndex((prev) => prev + 1)
            setSuccess("")
          }, 1500)
          return
        }

        // Update progress immediately if this challenge wasn't completed before
        if (userId && !completedChallenges.includes(activeChallengeId)) {
          try {
            const progress = await markChallengeCompleted(userId, activeChallengeId)
            setCompletedChallenges(progress.completedChallenges)
          } catch (progressError) {
            console.error("Failed to update flag counter:", progressError)
          }
        }

        if (nextChallenge) {
          const nextLabel = nextChallenge.challengeNo || "next challenge"
          setSuccess(`🎉 Oh you found a flag! Challenge cleared! Loading ${nextLabel}...`)
          setCode("")
          setTimeout(() => {
            router.replace(`/challenge?id=${nextChallenge.id}`)
          }, 2000)
        } else {
          setSuccess("🎉 Oh you found a flag! You've completed all challenges!")
          setCode("")
        }
      } else {
        setError("❌ Incorrect flag. Try again!")
      }
    } catch (err) {
      console.error("Error verifying flag:", err)
      setError("Failed to verify flag")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f48120] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full border-4 border-black border-t-transparent animate-spin mx-auto" />
          <p className="text-sm uppercase tracking-[0.3em] text-black">Loading challenge...</p>
        </div>
      </div>
    )
  }

  if (error && !challenge) {
    return (
      <div className="min-h-screen bg-[#f48120] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-2xl font-bold text-black">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-black text-white px-6 py-3 rounded-full font-semibold hover:scale-105 transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f48120] flex flex-col items-center justify-center px-4 sm:px-6 py-10 text-black">
      <div className="w-full max-w-4xl space-y-8 sm:space-y-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-black text-white rounded-full px-6 py-4">
            <p className="text-3xl font-semibold tracking-wide">
              Flags <span className="text-[#f1d3a8]">{formattedFlagCount}</span>
            </p>
          </div>
          <img src="/images/acc-logo.png" alt="ACC Logo" className="h-14 sm:h-16 w-auto" />
        </div>

        <div className="bg-[#f1caa2] rounded-[36px] sm:rounded-[48px] p-6 sm:p-8 text-center">
          <p className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-wide">
            {challenge?.challengeNo ?? "Challenge"}
          </p>
        </div>

        <div className="bg-[#f1caa2] rounded-[36px] sm:rounded-[48px] p-6 sm:p-8 min-h-[220px] sm:min-h-[256px]">
          {currentQuestion ? (
            <div className="space-y-4 text-center">
              <p className="text-sm uppercase tracking-[0.4em] text-black/60">
                Question {questionIndex + 1}
                {totalQuestions ? ` / ${totalQuestions}` : null}
              </p>
              <p className="text-lg sm:text-xl md:text-2xl font-medium text-center opacity-70">
                {currentQuestion.question}
              </p>
            </div>
          ) : (
            <p className="text-lg sm:text-xl md:text-2xl font-medium text-center opacity-70">
              No questions configured for this challenge.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#f1caa2] rounded-full px-6 sm:px-8 py-4 sm:py-5 border border-black/40">
            <label htmlFor="flag-code" className="sr-only">
              Input Code
            </label>
            <input
              id="flag-code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Input Code"
              className="w-full bg-transparent focus:outline-none text-base sm:text-xl font-medium placeholder-black/70"
            />
          </div>

          {error && <p className="text-center text-lg font-semibold text-red-700">{error}</p>}
          {success && <p className="text-center text-lg font-semibold text-green-700">{success}</p>}

          <div className="flex justify-center">
            <button
              type="submit"
              className="w-full sm:w-auto bg-black text-white text-xl sm:text-2xl font-semibold rounded-full px-10 sm:px-16 py-4 sm:py-5 hover:translate-y-0.5 transition-transform"
            >
              Enter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChallengePageFallback() {
  return (
    <div className="min-h-screen bg-[#f48120] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full border-4 border-black border-t-transparent animate-spin mx-auto" />
        <p className="text-sm uppercase tracking-[0.3em] text-black">Loading challenge...</p>
      </div>
    </div>
  )
}
