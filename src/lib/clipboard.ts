export type ClipboardResult = 'copied' | 'fallback'

/**
 * Writes text to the clipboard. Falls back to a legacy execCommand copy from a
 * temporary textarea when the async Clipboard API is unavailable or rejected
 * (non-secure context, missing permission).
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      // fall through to legacy path
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let succeeded = false
  try {
    succeeded = document.execCommand('copy')
  } catch {
    succeeded = false
  }
  document.body.removeChild(textarea)

  return succeeded ? 'copied' : 'fallback'
}
