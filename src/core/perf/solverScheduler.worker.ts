type SolverWorkerMessage = {
  type: 'schedule'
}

let queued = false

self.onmessage = (event: MessageEvent<SolverWorkerMessage>) => {
  if (event.data.type !== 'schedule' || queued) return
  queued = true
  setTimeout(() => {
    queued = false
    self.postMessage({ type: 'flush' })
  }, 0)
}
