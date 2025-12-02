"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged, signOut } from "firebase/auth"

import { auth } from "@/lib/firebase"

export default function Home() {
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login")
        return
      }
      setIsReady(true)
    })

    return () => unsubscribe()
  }, [router])

  const handleSignOut = async () => {
    await signOut(auth)
    router.replace("/login")
  }

  const handleStartChallenge = () => {
    if (auth.currentUser) {
      sessionStorage.removeItem(`flag-count:${auth.currentUser.uid}`)
    }
    router.push("/challenge")
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 text-black">
          <div className="w-16 h-16 rounded-full border-4 border-[#F6CDA0] border-t-transparent animate-spin mx-auto" />
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Preparing your mission...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between px-4 sm:px-8 pt-8 pb-8 sm:pb-12 relative z-10">
        {/* Logo */}
        <img src="/images/acc-logo.png" alt="acc logo" className="h-12 sm:h-16 w-auto" />

        {/* User Profile Icon */}
        <div className="flex items-center gap-3 sm:gap-4 self-stretch md:self-auto justify-end">
          <button
            className="w-12 h-12 rounded-full bg-[#F6CDA0] flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 cursor-pointer"
            aria-label="User profile menu"
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="8" r="4" fill="black" />
              <path d="M12 13C8.13 13 5 15.13 5 18v3h14v-3c0-2.87-3.13-5-7-5z" fill="black" />
            </svg>
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border border-black/10 bg-card text-black text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase shadow-md hover:-translate-y-0.5 hover:shadow-lg transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-20 sm:pb-40 text-center">
        {/* Headline */}
        <div className="mb-10 sm:mb-12">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-black leading-tight mb-4">
            Solve the Mystery
          </h1>
          <p className="text-base sm:text-lg text-black/80 max-w-2xl mx-auto">
            Track clues, decode intel, and race to capture every flag. Your first mission awaits below.
          </p>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleStartChallenge}
          className="w-full sm:w-auto text-xl sm:text-2xl rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 font-semibold px-8 sm:px-12 py-4 sm:py-6 border border-muted bg-card-foreground text-[rgba(246,205,160,1)] border-none"
        >
          Start Challange
        </button>
      </main>

      {/* Wave Shape Bottom */}
      <svg
        className="fixed bottom-0 left-0 right-0 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 320"
        aria-hidden="true"
      >
        <path
          fill="#F6CDA0"
          fillOpacity="1"
          d="M0,288L48,272C96,256,192,224,288,197.3C384,171,480,149,576,165.3C672,181,768,235,864,250.7C960,267,1056,245,1152,250.7C1248,256,1344,288,1392,304L1440,320L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
        ></path>
      </svg>
    </div>
  )
}
