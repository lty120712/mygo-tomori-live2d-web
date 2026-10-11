// History contains editor data only; renderer instances and playback stay outside it.
export function createEditHistory({ capture, restore, changed = () => {}, limit = 100, now = Date.now }) {
  const undoStack = [], redoStack = []
  let gesture = null
  const equal = (a, b) => JSON.stringify([a.project, a.overrides]) === JSON.stringify([b.project, b.overrides])
  function commit(before, after, key) {
    if (equal(before, after)) return
    const previous = undoStack.at(-1), timestamp = now()
    if (key && previous?.key === key && timestamp - previous.timestamp < 600 && !redoStack.length) {
      previous.after = after; previous.timestamp = timestamp
    } else {
      undoStack.push({ before, after, key, timestamp })
      if (undoStack.length > limit) undoStack.shift()
    }
    redoStack.length = 0; changed()
  }
  function end() {
    if (!gesture) return
    const before = gesture; gesture = null
    commit(before, capture())
  }
  return {
    get canUndo() { return undoStack.length > 0 || !!(gesture && !equal(gesture,capture())) },
    get canRedo() { return redoStack.length > 0 && !(gesture && !equal(gesture,capture())) },
    begin() { end(); gesture = capture() },
    end,
    edit(fn, key) {
      if (gesture) { const result = fn(); changed(); return result }
      const before = capture(), result = fn()
      commit(before, capture(), key)
      return result
    },
    undo() {
      end(); const entry = undoStack.pop(); if (!entry) return
      restore(entry.before); redoStack.push(entry); changed()
    },
    redo() {
      end(); const entry = redoStack.pop(); if (!entry) return
      restore(entry.after); undoStack.push(entry); changed()
    },
  }
}
