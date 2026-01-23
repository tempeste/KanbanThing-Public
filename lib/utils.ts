import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateWorkspacePrefix(name: string): string {
  const words = name.split(/[\s-_]+/).filter((word) => /[a-zA-Z]/.test(word))
  if (words.length >= 2) {
    const initials = words
      .map((word) => word.match(/[a-zA-Z]/)?.[0] ?? "")
      .join("")
      .toUpperCase()
    const trimmed = initials.replace(/[^A-Z]/g, "").slice(0, 3)
    if (trimmed.length >= 2) return trimmed
  }

  const cleaned = name.replace(/[^a-zA-Z]/g, "").toUpperCase()
  if (cleaned.length >= 3) return cleaned.slice(0, 3)
  if (cleaned.length === 2) return cleaned
  if (cleaned.length === 1) return `${cleaned}X`
  return "PRJ"
}

export function formatTicketNumber(prefix: string, number?: number | null) {
  if (!number) return null
  return `${prefix}-${number}`
}
