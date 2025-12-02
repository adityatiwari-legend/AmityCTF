import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY

if (!serviceAccountRaw) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY. Provide your service account JSON via this env var.")
  process.exit(1)
}

let serviceAccount

try {
  serviceAccount = JSON.parse(serviceAccountRaw)
} catch (error) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY must be valid JSON:", error)
  process.exit(1)
}

if (!serviceAccount.project_id) {
  console.error("Service account JSON is missing the project_id field. Check your credentials.")
  process.exit(1)
}

initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
})

const db = getFirestore()

const defaultChallenges = [
  {
    id: "challenge-1",
    challengeNo: "Challenge 1",
    isActive: true,
    questions: [
      {
        prompt: "Decode the warm-up flag hidden in README.md and submit it as FLAG{message}.",
        answer: "FLAG{welcome_to_amityctf}",
      },
      {
        prompt: "Decode the second hint hidden inside app/page.tsx comments.",
        answer: "FLAG{second_signal}",
      },
    ],
  },
  {
    id: "challenge-2",
    challengeNo: "Challenge 2",
    isActive: true,
    questions: [
      {
        prompt: "Inspect the network tab to find the secret token. Answer format: FLAG{token}.",
        answer: "FLAG{api_secret_2024}",
      },
      {
        prompt: "Combine the headers from the API response to build the final token.",
        answer: "FLAG{headers_combined}",
      },
    ],
  },
  {
    id: "challenge-3",
    challengeNo: "Challenge 3",
    isActive: true,
    questions: [
      {
        prompt: "Decrypt the cipher in lib/crypto.ts to reveal the master flag.",
        answer: "FLAG{master_decoder}",
      },
      {
        prompt: "Final boss: use the decrypted key to unlock the hidden endpoint.",
        answer: "FLAG{final_unlock}",
      },
    ],
  },
]

async function seedChallenges() {
  const batch = db.batch()

  defaultChallenges.forEach(({ id, challengeNo, isActive = true, questions = [] }) => {
    const ref = db.collection("challenges").doc(id)
    const payload = {
      challengeNo,
      isActive,
    }

    questions.forEach((question, index) => {
      const number = question.number ?? index + 1
      payload[`Question ${number}`] = question.prompt
      payload[`Ans ${number}`] = question.answer
    })

    batch.set(ref, payload, { merge: true })
  })

  await batch.commit()
  console.log(`Seeded ${defaultChallenges.length} document(s) into the 'challenges' collection.`)
}

seedChallenges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed challenges:", error)
    process.exit(1)
  })
