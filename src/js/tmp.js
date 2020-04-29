const Pipe = require("it-pipe")
const ItPushable = require("it-pushable")
const ItLengthPrefixed = require("it-length-prefixed")
const { EventEmitter } = require("events")
const { inspect } = require("util")

const Debug = require("debug-level")
const debug = Debug("xch:tmp")

function stdinToStream(stream) {
  // Read utf-8 from stdin
  process.stdin.setEncoding('utf8')
  Pipe(
    // Read from stdin (the source)
    process.stdin,
    // Encode with length prefix (so receiving side knows how much data is coming)
    ItLengthPrefixed.encode(),
    // Write to the stream (the sink)
    stream.sink
  )
}

function writerToStream(pushable, stream) {
  Pipe(
    pushable,
    // Encode with length prefix (so receiving side knows how much data is coming)
    ItLengthPrefixed.encode(),
    // Write to the stream (the sink)
    stream.sink
  )
}

function streamToConsole(stream) {
  Pipe(
    // Read from the stream (the source)
    stream.source,
    // Print raw
    function(source) {
      const ret = (async function * () {
        for await (const chunk of source) {
          console.log(`raw: ${inspect(chunk.slice())}`)
          yield chunk
        }
      })()
      return ret
    },
    // Decode length-prefixed data
    ItLengthPrefixed.decode(),
    // Sink function
    async function (source) {
      // For each chunk of data
      for await (const msg of source) {
        // Output the data as a utf8 string
        console.log('> ' + msg.toString('utf8').replace('\n', ''))
      }
    }
  )
}

const stream = new EventEmitter()

stream.sink = async function(source) {
  for await (const chunk of source) {
    stream.emit("data", chunk)
  }
}

stream.source = {
  [Symbol.asyncIterator] () {
    return {
      async next () {
        const chunk = await new Promise((resolve) => { stream.resolve = resolve })
        return { done: false, value: chunk }
      }
    }
  }
}

stream.on("data", function(chunk) {
  if (this.resolve) {
    this.resolve(chunk)
  }
})

const writer = ItPushable()
writerToStream(writer, stream)
streamToConsole(stream)

writer.push(Buffer.from("xyz"))
