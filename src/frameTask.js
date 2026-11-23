// Merge high-frequency input into one task per display frame, using the latest input.
export function createFrameTask(run, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let pending = null
  return {
    schedule() {
      if (pending !== null) return
      pending = request(() => { pending = null; run() })
    },
    cancel() {
      if (pending !== null) cancel(pending)
      pending = null
    },
  }
}
