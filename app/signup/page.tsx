"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthError, createUserWithEmailAndPassword, updateProfile } from "firebase/auth"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"

import { auth, db } from "@/lib/firebase"
import { syncPlayerProfile } from "@/lib/players"

const mapSignupError = (code: string) => {
  switch (code) {
    case "auth/email-already-in-use":
      return "There's already a commander with this email. Try logging in instead."
    case "auth/invalid-email":
      return "That email address looks invalid."
    case "auth/weak-password":
      return "Try a stronger password (at least 6 characters)."
    default:
      return "We couldn't create your profile right now. Please try again."
  }
}

export default function SignupPage() {
  const router = useRouter()
  const [values, setValues] = useState({ name: "", email: "", password: "" })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [busy, setBusy] = useState(false)

  const isDisabled = useMemo(
    () => busy || !values.name || !values.email || values.password.length < 6,
    [busy, values.email, values.name, values.password],
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    setBusy(true)

    try {
      console.log("Starting signup process...")
      const credential = await createUserWithEmailAndPassword(auth, values.email.trim(), values.password)
      console.log("User created in Auth:", credential.user.uid)
      
      const trimmedName = values.name.trim()
      if (trimmedName) {
        await updateProfile(credential.user, { displayName: trimmedName })
        console.log("Display name updated:", trimmedName)
      }

      console.log("Attempting to write to Firestore users collection...")
      const userDocRef = doc(db, "users", credential.user.uid)
      await setDoc(
        userDocRef,
        {
          name: trimmedName,
          email: credential.user.email,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )
      await syncPlayerProfile(credential.user.uid, {
        name: trimmedName || credential.user.displayName,
        email: credential.user.email,
      })
      console.log("Successfully wrote to Firestore!")
      setSuccess("Profile created! Launching the mission...")
      router.replace("/")
    } catch (authError) {
      console.error("Signup error:", authError)
      const code = (authError as AuthError).code ?? ""
      const message = (authError as Error).message ?? ""
      console.log("Error code:", code, "Message:", message)
      setError(mapSignupError(code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-black relative overflow-hidden flex items-center justify-center px-4 sm:px-6 py-10 sm:py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(0,0,0,0.08),_transparent_55%)]" aria-hidden />
      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-10 text-center">
          <p className="text-xs sm:text-sm uppercase tracking-[0.4em] text-muted-foreground">Capture the Flag</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight">Create Your Commander Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-3">
            Sign up to join the hunt and unlock the main experience.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 bg-card text-card-foreground border border-primary/15 rounded-[36px] shadow-2xl p-6 sm:p-10"
        >
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={values.name}
              onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-2xl border border-black/10 bg-background/30 px-5 py-4 text-lg focus:outline-none focus:ring-4 focus:ring-[#F6CDA0]/60"
              placeholder="Commander Jane"
              autoComplete="name"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="signup-email" className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={values.email}
              onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-2xl border border-black/10 bg-background/30 px-5 py-4 text-lg focus:outline-none focus:ring-4 focus:ring-[#F6CDA0]/60"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="signup-password" className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={values.password}
              onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
              className="w-full rounded-2xl border border-black/10 bg-background/30 px-5 py-4 text-lg focus:outline-none focus:ring-4 focus:ring-[#F6CDA0]/60"
              placeholder="Create a strong password"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Use at least 6 characters to keep things secure.</p>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-700">{success}</p> : null}

          <button
            type="submit"
            disabled={isDisabled}
            className="w-full rounded-full bg-card-foreground text-[#F6CDA0] text-lg sm:text-xl font-semibold py-3.5 sm:py-4 shadow-lg shadow-black/10 hover:shadow-2xl hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Setting up your profile..." : "Join the Mission"}
          </button>

          <p className="text-center text-xs sm:text-sm text-muted-foreground">
            Already enlisted?{" "}
            <Link href="/login" className="font-semibold text-black underline-offset-4 hover:underline">
              Head to login
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
