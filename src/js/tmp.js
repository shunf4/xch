const abortable = require('abortable-iterator')
const AbortController = require('abort-controller')

// An example function that creates an async iterator that yields an increasing
// number every x milliseconds and NEVER ENDS!
const asyncCounter = async function * (start, delay) {
  let i = start
  while (true) {
    yield new Promise(resolve => setTimeout(() => {
      console.log(`(${i})`)
      resolve(i++)
    }, delay))
  }
}

;void((async () => {
  // Create a counter that'll yield numbers from 0 upwards every second
  const everySecond = asyncCounter(0, 1000)

  // Make everySecond abortable!
  const controller = new AbortController()
  const abortableEverySecond = abortable(everySecond, controller.signal)

  // Abort after 5 seconds
  setTimeout(() => controller.abort(), 5000)

  setTimeout(() => {}, 20000)

  try {
    // Start the iteration, which will throw after 5 seconds when it is aborted
    for await (const n of abortableEverySecond) {
      console.log(n)
    }
  } catch (err) {
    if (err.code === 'ERR_ABORTED' || err.code === 'ABORT_ERR') {
      console.log("aborted: ok")
      // Expected - all ok :D
    } else {
      console.log("other err: not ok", err.code)
      throw err
    }
  }
})())

