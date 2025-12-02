import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { db } from "./firebase"

export interface ChallengeQuestion {
  number: number
  question: string
  answer: string
}

export interface Challenge {
  id: string
  challengeNo: string
  questions: ChallengeQuestion[]
  isActive?: boolean
}

const normalizeKey = (rawKey: string) => rawKey.replace(/[-_]+/g, " ").trim()
const QUESTION_REGEX = /^question\s*(\d+)$/i

const findAnswerValue = (source: Record<string, unknown>, number: number) => {
  const candidates = [
    `Ans ${number}`,
    `Ans${number}`,
    `Answer ${number}`,
    `answer${number}`,
    `ans_${number}`,
  ]

  for (const key of candidates) {
    const exact = source[key]
    if (typeof exact === "string") {
      return exact
    }

    // try trimmed version if original key contained stray whitespace
    const trimmedKey = key.trim()
    const trimmedMatch = source[trimmedKey]
    if (typeof trimmedMatch === "string") {
      return trimmedMatch
    }
  }

  return null
}

const normalizeChallenge = (id: string, data: Record<string, unknown>): Challenge => {
  const questions: ChallengeQuestion[] = Object.entries(data)
    .map(([key, value]) => {
      const sanitizedKey = normalizeKey(key)
      const match = sanitizedKey.match(QUESTION_REGEX)
      if (!match) return null
      const number = Number(match[1])
      const answerRaw = findAnswerValue(data, number)

      if (typeof value !== "string" || typeof answerRaw !== "string") {
        return null
      }

      return {
        number,
        question: value.trim(),
        answer: answerRaw.trim(),
      }
    })
    .filter((item): item is ChallengeQuestion => item !== null)
    .sort((a, b) => a.number - b.number)

  return {
    id,
    challengeNo: typeof data.challengeNo === "string" ? data.challengeNo : id,
    questions,
    isActive: data.isActive !== false,
  }
}

const CHALLENGES_COLLECTION = "challenges"
const USERS_COLLECTION = "users"

/**
 * Fetch all active challenges from Firestore
 */
export async function getChallenges(): Promise<Challenge[]> {
  try {
    const querySnapshot = await getDocs(collection(db, CHALLENGES_COLLECTION))
    const challenges: Challenge[] = []

    querySnapshot.forEach((doc) => {
      challenges.push(normalizeChallenge(doc.id, doc.data()))
    })
    return challenges.filter((item) => item.isActive !== false)
  } catch (error) {
    console.error("Error fetching challenges:", error)
    throw error
  }
}

/**
 * Fetch a single challenge by ID
 */
export async function getChallengeById(id: string): Promise<Challenge | null> {
  try {
    const docRef = doc(db, CHALLENGES_COLLECTION, id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return normalizeChallenge(docSnap.id, docSnap.data())
    }

    return null
  } catch (error) {
    console.error("Error fetching challenge:", error)
    throw error
  }
}

/**
 * Create or update a challenge
 */
export async function saveChallenge(challenge: Omit<Challenge, "id"> & { id?: string }): Promise<string> {
  try {
    const challengeId = challenge.id || `challenge-${Date.now()}`
    const docRef = doc(db, CHALLENGES_COLLECTION, challengeId)

    const challengeData = {
      ...challenge,
      updatedAt: serverTimestamp(),
      createdAt: challenge.id ? undefined : serverTimestamp(),
    }

    if (challenge.id) {
      await updateDoc(docRef, challengeData)
    } else {
      await setDoc(docRef, challengeData)
    }

    return challengeId
  } catch (error) {
    console.error("Error saving challenge:", error)
    throw error
  }
}

/**
 * Verify if a submitted flag is correct
 */
export async function verifyFlag(challengeId: string, questionNumber: number, submittedFlag: string): Promise<boolean> {
  try {
    const challenge = await getChallengeById(challengeId)
    if (!challenge) {
      return false
    }
    const question = challenge.questions.find((item) => item.number === questionNumber)
    if (!question) {
      return false
    }

    return question.answer.trim().toLowerCase() === submittedFlag.trim().toLowerCase()
  } catch (error) {
    console.error("Error verifying flag:", error)
    return false
  }
}

export interface UserProgress {
  completedChallenges: string[]
  completedQuestions: string[]
}

const normalizeProgress = (data?: Record<string, unknown>): UserProgress => {
  const rawChallengeList = Array.isArray(data?.completedChallenges)
    ? (data!.completedChallenges as unknown[])
    : []
  const rawQuestionList = Array.isArray(data?.completedQuestions)
    ? (data!.completedQuestions as unknown[])
    : []

  const cleanedChallenges = rawChallengeList.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  const cleanedQuestions = rawQuestionList.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  return { completedChallenges: cleanedChallenges, completedQuestions: cleanedQuestions }
}

export async function getUserProgress(userId: string): Promise<UserProgress> {
  if (!userId) return { completedChallenges: [], completedQuestions: [] }
  const userRef = doc(db, USERS_COLLECTION, userId)
  const snap = await getDoc(userRef)

  if (!snap.exists()) {
    await setDoc(userRef, { completedChallenges: [], completedQuestions: [] }, { merge: true })
    return { completedChallenges: [], completedQuestions: [] }
  }

  return normalizeProgress(snap.data())
}

export async function markChallengeCompleted(userId: string, challengeId: string): Promise<UserProgress> {
  if (!userId) {
    return { completedChallenges: [], completedQuestions: [] }
  }

  const userRef = doc(db, USERS_COLLECTION, userId)
  await setDoc(userRef, { completedChallenges: arrayUnion(challengeId) }, { merge: true })
  return getUserProgress(userId)
}

export async function markQuestionCompleted(
  userId: string,
  challengeId: string,
  questionNumber: number
): Promise<UserProgress> {
  if (!userId) {
    return { completedChallenges: [], completedQuestions: [] }
  }

  const questionId = `${challengeId}-q${questionNumber}`
  const userRef = doc(db, USERS_COLLECTION, userId)
  await setDoc(userRef, { completedQuestions: arrayUnion(questionId) }, { merge: true })
  return getUserProgress(userId)
}
